/**
 * D1 data access: row mapping, scoped snapshot loading, delta persistence and local-data import.
 *
 * Bulk writes pass a whole JSON array as a single bound parameter and expand it with `json_each`,
 * which keeps every statement far below D1's 100-parameter limit and lets one batch (= one
 * transaction) carry any number of records.
 */
import { compact, createEmptySnapshot, isISODate, LIMITS, sanitizeRubberHistory } from "../src/db/domain";
import {
  ENTITY_KEYS,
  isGripType,
  RACKET_STATUSES,
  RUBBER_SIDES,
  type AppDataDelta,
  type AppSnapshot,
  type BoostingLog,
  type EntityKey,
  type PlaySession,
  type Racket,
  type RacketStatus,
  type Rubber,
  type RubberSide,
  type SyncImportResponse,
} from "../src/db/schema";

// ---------------------------------------------------------------------------
// Table specs
// ---------------------------------------------------------------------------

type Column = { name: string; key: string; fallback?: string };
type TableSpec = { table: string; columns: Column[]; hasUpdatedAt: boolean };

const TABLES: Record<EntityKey, TableSpec> = {
  rackets: {
    table: "rackets",
    hasUpdatedAt: true,
    columns: [
      { name: "id", key: "id" },
      { name: "name", key: "name" },
      { name: "blade", key: "blade" },
      { name: "status", key: "status", fallback: "'active'" },
      { name: "forehand_rubber_id", key: "forehandRubberId" },
      { name: "backhand_rubber_id", key: "backhandRubberId" },
      { name: "sort_order", key: "sortOrder" },
      { name: "notes", key: "notes" },
      { name: "grip_type", key: "gripType" },
      { name: "blade_weight_grams", key: "bladeWeightGrams" },
      { name: "total_weight_grams", key: "totalWeightGrams" },
      { name: "started_at", key: "startedAt" },
      { name: "initial_play_minutes", key: "initialPlayMinutes" },
      { name: "created_at", key: "createdAt" },
      { name: "updated_at", key: "updatedAt", fallback: "json_extract(value, '$.createdAt')" },
    ],
  },
  rubbers: {
    table: "rubbers",
    hasUpdatedAt: true,
    columns: [
      { name: "id", key: "id" },
      { name: "racket_id", key: "racketId" },
      { name: "side", key: "side" },
      { name: "name", key: "name" },
      { name: "label", key: "label" },
      { name: "quantity", key: "quantity" },
      { name: "hardness", key: "hardness" },
      { name: "thickness_mm", key: "thicknessMm" },
      { name: "weight_grams", key: "weightGrams" },
      { name: "installed_at", key: "installedAt" },
      { name: "mounted_at", key: "mountedAt" },
      { name: "removed_at", key: "removedAt" },
      // JSON text of the timeline array (`json_extract` returns arrays as JSON text).
      { name: "history", key: "history" },
      { name: "stashed_at", key: "stashedAt" },
      { name: "storage_aging_percent", key: "storageAgingPercent" },
      { name: "boosted", key: "boosted", fallback: "0" },
      { name: "custom_calendar_days", key: "customCalendarDays" },
      { name: "custom_play_minutes", key: "customPlayMinutes" },
      { name: "initial_play_minutes", key: "initialPlayMinutes" },
      { name: "boost_cycle_days", key: "boostCycleDays" },
      { name: "notes", key: "notes" },
      { name: "created_at", key: "createdAt" },
      { name: "updated_at", key: "updatedAt", fallback: "json_extract(value, '$.createdAt')" },
    ],
  },
  boostingLogs: {
    table: "boosting_logs",
    hasUpdatedAt: false,
    columns: [
      { name: "id", key: "id" },
      { name: "rubber_id", key: "rubberId" },
      { name: "date", key: "date" },
      { name: "boost_number", key: "boostNumber" },
      { name: "layers", key: "layers" },
      { name: "notes", key: "notes" },
      { name: "created_at", key: "createdAt" },
    ],
  },
  playSessions: {
    table: "play_sessions",
    hasUpdatedAt: false,
    columns: [
      { name: "id", key: "id" },
      { name: "racket_id", key: "racketId" },
      { name: "date", key: "date" },
      { name: "duration_minutes", key: "durationMinutes" },
      { name: "notes", key: "notes" },
      { name: "created_at", key: "createdAt" },
    ],
  },
};

const columnList = (key: EntityKey) => TABLES[key].columns.map((column) => column.name).join(", ");

/**
 * - `overwrite`: the record wins (mutations computed by the shared planners);
 * - `newer`: write only when the record is newer than the cloud row (import of rackets / rubbers),
 *   so re-importing unchanged records is a no-op and cloud edits made later are kept;
 * - `ignore`: insert missing rows only (import of logs / sessions, which have no `updated_at`).
 */
type ConflictMode = "overwrite" | "newer" | "ignore";

function buildUpsertSql({ table, columns }: TableSpec, mode: ConflictMode) {
  const names = columns.map((column) => column.name);
  const values = columns.map(({ key, fallback }) => {
    const extract = `json_extract(value, '$.${key}')`;
    return fallback ? `COALESCE(${extract}, ${fallback})` : extract;
  });
  let conflict = "DO NOTHING";
  if (mode !== "ignore") {
    const assignments = names.filter((name) => name !== "id" && name !== "created_at").map((name) => `${name} = excluded.${name}`);
    conflict = `DO UPDATE SET ${assignments.join(", ")}`;
    if (mode === "newer") conflict += ` WHERE excluded.updated_at > ${table}.updated_at`;
  }
  // `WHERE true` resolves the INSERT ... SELECT ... ON CONFLICT parsing ambiguity in SQLite.
  return `INSERT INTO ${table} (user_id, ${names.join(", ")}) SELECT ?1, ${values.join(", ")} FROM json_each(?2) WHERE true ON CONFLICT (user_id, id) ${conflict}`;
}

const UPSERT_SQL = Object.fromEntries(
  ENTITY_KEYS.map((key) => [
    key,
    {
      overwrite: buildUpsertSql(TABLES[key], "overwrite"),
      newer: buildUpsertSql(TABLES[key], TABLES[key].hasUpdatedAt ? "newer" : "ignore"),
      ignore: buildUpsertSql(TABLES[key], "ignore"),
    },
  ]),
) as Record<EntityKey, Record<ConflictMode, string>>;

const DELETE_SQL = Object.fromEntries(
  ENTITY_KEYS.map((key) => [key, `DELETE FROM ${TABLES[key].table} WHERE user_id = ?1 AND id IN (SELECT value FROM json_each(?2))`]),
) as Record<EntityKey, string>;

/** Re-numbers every boosting log of a user 1..n per rubber, ordered by (date, created_at, id). */
const RENUMBER_BOOSTS_SQL = `UPDATE boosting_logs SET boost_number = (
  SELECT COUNT(*) FROM boosting_logs AS earlier
  WHERE earlier.user_id = boosting_logs.user_id
    AND earlier.rubber_id = boosting_logs.rubber_id
    AND (earlier.date < boosting_logs.date
      OR (earlier.date = boosting_logs.date AND earlier.created_at < boosting_logs.created_at)
      OR (earlier.date = boosting_logs.date AND earlier.created_at = boosting_logs.created_at AND earlier.id <= boosting_logs.id))
) WHERE user_id = ?1`;

const RECORDS_PER_STATEMENT = 250;
const MAX_IMPORT_RECORDS = 20_000;

function chunk<T>(items: T[], size = RECORDS_PER_STATEMENT) {
  const chunks: T[][] = [];
  for (let index = 0; index < items.length; index += size) chunks.push(items.slice(index, index + size));
  return chunks;
}

// ---------------------------------------------------------------------------
// Schema upgrades
// ---------------------------------------------------------------------------

/** Columns added after the first release; keep in sync with `schema.sql` and `migrate_v2.sql`. */
const ADDED_COLUMNS: { table: string; column: string; type: "TEXT" | "REAL" | "INTEGER" }[] = [
  { table: "rackets", column: "grip_type", type: "TEXT" },
  { table: "rackets", column: "blade_weight_grams", type: "REAL" },
  { table: "rackets", column: "total_weight_grams", type: "REAL" },
  { table: "rackets", column: "started_at", type: "TEXT" },
  { table: "rackets", column: "initial_play_minutes", type: "INTEGER" },
  { table: "rubbers", column: "weight_grams", type: "REAL" },
  { table: "rubbers", column: "initial_play_minutes", type: "INTEGER" },
  { table: "rubbers", column: "mounted_at", type: "TEXT" },
  { table: "rubbers", column: "label", type: "TEXT" },
  { table: "rubbers", column: "quantity", type: "INTEGER" },
  { table: "rubbers", column: "history", type: "TEXT" },
  { table: "rubbers", column: "stashed_at", type: "TEXT" },
  { table: "rubbers", column: "storage_aging_percent", type: "INTEGER" },
];

let schemaCheck: Promise<void> | undefined;

/**
 * Safety net behind `worker/migrate_v2.sql`: once per Worker isolate, adds the columns of
 * {@link ADDED_COLUMNS} that an older database lacks, so a Worker deployed before the migration ran
 * keeps working instead of failing every query with "no such column". Only nullable columns are
 * added, which never touches existing rows.
 */
export function ensureSchema(db: D1Database) {
  schemaCheck ??= addMissingColumns(db).catch((error: unknown) => {
    // Never block requests on the safety net; the migration script is the primary path.
    console.error("Schema check failed", error);
  });
  return schemaCheck;
}

async function addMissingColumns(db: D1Database) {
  const existing = new Map<string, Set<string>>();
  for (const table of new Set(ADDED_COLUMNS.map((item) => item.table))) {
    const { results } = await db.prepare(`PRAGMA table_info(${table})`).all<{ name: string }>();
    existing.set(table, new Set(results.map((row) => row.name)));
  }
  for (const { table, column, type } of ADDED_COLUMNS) {
    const columns = existing.get(table);
    // No columns: the table does not exist yet (schema.sql has not been applied).
    if (!columns?.size || columns.has(column)) continue;
    try {
      await db.prepare(`ALTER TABLE ${table} ADD COLUMN ${column} ${type}`).run();
    } catch (error) {
      // Another isolate may have added it concurrently.
      if (!/duplicate column/i.test(String(error))) throw error;
    }
  }
}

// ---------------------------------------------------------------------------
// Row mapping
// ---------------------------------------------------------------------------

type RacketRow = {
  id: string;
  name: string;
  blade: string;
  status: string;
  forehand_rubber_id: string | null;
  backhand_rubber_id: string | null;
  sort_order: number | null;
  notes: string | null;
  grip_type: string | null;
  blade_weight_grams: number | null;
  total_weight_grams: number | null;
  started_at: string | null;
  initial_play_minutes: number | null;
  created_at: string;
  updated_at: string;
};

type RubberRow = {
  id: string;
  racket_id: string | null;
  side: string | null;
  name: string;
  label: string | null;
  quantity: number | null;
  hardness: string | null;
  thickness_mm: number | null;
  weight_grams: number | null;
  installed_at: string | null;
  mounted_at: string | null;
  removed_at: string | null;
  history: string | null;
  stashed_at: string | null;
  storage_aging_percent: number | null;
  boosted: number;
  custom_calendar_days: number | null;
  custom_play_minutes: number | null;
  initial_play_minutes: number | null;
  boost_cycle_days: number | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
};

type BoostingLogRow = {
  id: string;
  rubber_id: string;
  date: string;
  boost_number: number;
  layers: number;
  notes: string | null;
  created_at: string;
};

type PlaySessionRow = {
  id: string;
  racket_id: string;
  date: string;
  duration_minutes: number;
  notes: string | null;
  created_at: string;
};

const isRacketStatus = (value: unknown): value is RacketStatus => RACKET_STATUSES.includes(value as RacketStatus);
const isRubberSide = (value: unknown): value is RubberSide => RUBBER_SIDES.includes(value as RubberSide);

/** Timeline stored as JSON text; malformed values are dropped. */
function parseHistory(text: string | null) {
  if (!text) return undefined;
  try {
    return sanitizeRubberHistory(JSON.parse(text));
  } catch {
    return undefined;
  }
}

const toRacket = (row: RacketRow): Racket =>
  compact({
    id: row.id,
    name: row.name,
    blade: row.blade,
    status: isRacketStatus(row.status) ? row.status : "active",
    forehandRubberId: row.forehand_rubber_id,
    backhandRubberId: row.backhand_rubber_id,
    sortOrder: row.sort_order,
    notes: row.notes,
    gripType: isGripType(row.grip_type) ? row.grip_type : undefined,
    bladeWeightGrams: row.blade_weight_grams,
    totalWeightGrams: row.total_weight_grams,
    startedAt: row.started_at,
    initialPlayMinutes: row.initial_play_minutes,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  });

const toRubber = (row: RubberRow): Rubber =>
  compact({
    id: row.id,
    racketId: row.racket_id,
    side: isRubberSide(row.side) ? row.side : undefined,
    name: row.name,
    label: row.label,
    quantity: typeof row.quantity === "number" && row.quantity > 1 ? row.quantity : undefined,
    hardness: row.hardness,
    thicknessMm: row.thickness_mm,
    weightGrams: row.weight_grams,
    installedAt: row.installed_at,
    mountedAt: row.mounted_at,
    removedAt: row.removed_at,
    history: parseHistory(row.history),
    stashedAt: row.stashed_at,
    storageAgingPercent: row.storage_aging_percent,
    boosted: Boolean(row.boosted),
    customCalendarDays: row.custom_calendar_days,
    customPlayMinutes: row.custom_play_minutes,
    initialPlayMinutes: row.initial_play_minutes,
    boostCycleDays: row.boost_cycle_days,
    notes: row.notes,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  });

const toBoostingLog = (row: BoostingLogRow): BoostingLog =>
  compact({
    id: row.id,
    rubberId: row.rubber_id,
    date: row.date,
    boostNumber: row.boost_number,
    layers: row.layers,
    notes: row.notes,
    createdAt: row.created_at,
  });

const toPlaySession = (row: PlaySessionRow): PlaySession =>
  compact({
    id: row.id,
    racketId: row.racket_id,
    date: row.date,
    durationMinutes: row.duration_minutes,
    notes: row.notes,
    createdAt: row.created_at,
  });

// ---------------------------------------------------------------------------
// Reads
// ---------------------------------------------------------------------------

/** Which rows of each table a request needs. Filters within one table are OR-ed. */
export type SnapshotScope = {
  rackets?: { all?: boolean; ids?: string[]; mountingRubberIds?: string[]; ofRubberIds?: string[] };
  /** `withHistory`: every rubber that has a timeline (it may have stints on any racket). */
  rubbers?: { all?: boolean; ids?: string[]; racketIds?: string[]; ofBoostingLogIds?: string[]; withHistory?: boolean };
  boostingLogs?: { all?: boolean; ids?: string[]; rubberIds?: string[]; racketIds?: string[]; siblingsOfIds?: string[] };
  playSessions?: { all?: boolean; ids?: string[]; racketIds?: string[] };
};

/** A condition on a JSON array parameter of ids, or (`true`) a condition without parameters. */
type Filter = [condition: (param: string) => string, ids: string[] | boolean | undefined];

const IN_JSON = (param: string) => `IN (SELECT value FROM json_each(${param}))`;

function scopedSelect(db: D1Database, userId: string, key: EntityKey, all: boolean | undefined, filters: Filter[]) {
  const base = `SELECT ${columnList(key)} FROM ${TABLES[key].table} WHERE user_id = ?1`;
  if (all) return db.prepare(base).bind(userId);

  const params: string[] = [];
  const conditions: string[] = [];
  for (const [condition, ids] of filters) {
    if (ids === true) {
      conditions.push(`(${condition("")})`);
      continue;
    }
    if (!Array.isArray(ids) || !ids.length) continue;
    params.push(JSON.stringify(ids));
    conditions.push(`(${condition(`?${params.length + 1}`)})`);
  }
  if (!conditions.length) return undefined;
  return db.prepare(`${base} AND (${conditions.join(" OR ")})`).bind(userId, ...params);
}

/** Loads the slice of a user's data described by `scope` in one D1 batch. */
export async function loadScope(db: D1Database, userId: string, scope: SnapshotScope): Promise<AppSnapshot> {
  const { rackets, rubbers, boostingLogs, playSessions } = scope;
  const queries: [EntityKey, D1PreparedStatement | undefined][] = [
    [
      "rackets",
      scopedSelect(db, userId, "rackets", rackets?.all, [
        [(param) => `id ${IN_JSON(param)}`, rackets?.ids],
        [(param) => `forehand_rubber_id ${IN_JSON(param)} OR backhand_rubber_id ${IN_JSON(param)}`, rackets?.mountingRubberIds],
        [(param) => `id IN (SELECT racket_id FROM rubbers WHERE user_id = ?1 AND id ${IN_JSON(param)})`, rackets?.ofRubberIds],
      ]),
    ],
    [
      "rubbers",
      scopedSelect(db, userId, "rubbers", rubbers?.all, [
        [(param) => `id ${IN_JSON(param)}`, rubbers?.ids],
        [(param) => `racket_id ${IN_JSON(param)}`, rubbers?.racketIds],
        [
          (param) => `id IN (SELECT rubber_id FROM boosting_logs WHERE user_id = ?1 AND id ${IN_JSON(param)})`,
          rubbers?.ofBoostingLogIds,
        ],
        [() => "history IS NOT NULL", rubbers?.withHistory],
      ]),
    ],
    [
      "boostingLogs",
      scopedSelect(db, userId, "boostingLogs", boostingLogs?.all, [
        [(param) => `id ${IN_JSON(param)}`, boostingLogs?.ids],
        [(param) => `rubber_id ${IN_JSON(param)}`, boostingLogs?.rubberIds],
        [
          (param) => `rubber_id IN (SELECT id FROM rubbers WHERE user_id = ?1 AND racket_id ${IN_JSON(param)})`,
          boostingLogs?.racketIds,
        ],
        [
          (param) => `rubber_id IN (SELECT rubber_id FROM boosting_logs WHERE user_id = ?1 AND id ${IN_JSON(param)})`,
          boostingLogs?.siblingsOfIds,
        ],
      ]),
    ],
    [
      "playSessions",
      scopedSelect(db, userId, "playSessions", playSessions?.all, [
        [(param) => `id ${IN_JSON(param)}`, playSessions?.ids],
        [(param) => `racket_id ${IN_JSON(param)}`, playSessions?.racketIds],
      ]),
    ],
  ];

  const snapshot = createEmptySnapshot();
  const active = queries.filter((query): query is [EntityKey, D1PreparedStatement] => Boolean(query[1]));
  if (!active.length) return snapshot;

  const results = await db.batch(active.map(([, statement]) => statement));
  active.forEach(([key], index) => {
    const rows = results[index].results;
    if (key === "rackets") snapshot.rackets = (rows as RacketRow[]).map(toRacket);
    if (key === "rubbers") snapshot.rubbers = (rows as RubberRow[]).map(toRubber);
    if (key === "boostingLogs") snapshot.boostingLogs = (rows as BoostingLogRow[]).map(toBoostingLog);
    if (key === "playSessions") snapshot.playSessions = (rows as PlaySessionRow[]).map(toPlaySession);
  });
  return snapshot;
}

export function loadSnapshot(db: D1Database, userId: string) {
  return loadScope(db, userId, {
    rackets: { all: true },
    rubbers: { all: true },
    boostingLogs: { all: true },
    playSessions: { all: true },
  });
}

// ---------------------------------------------------------------------------
// Writes
// ---------------------------------------------------------------------------

/** Writes a planner delta atomically (one D1 batch). */
export async function persistDelta(db: D1Database, userId: string, delta: AppDataDelta) {
  const statements: D1PreparedStatement[] = [];
  for (const key of ENTITY_KEYS) {
    for (const ids of chunk(delta.deletes[key])) {
      statements.push(db.prepare(DELETE_SQL[key]).bind(userId, JSON.stringify(ids)));
    }
  }
  for (const key of ENTITY_KEYS) {
    for (const records of chunk<object>(delta.upserts[key])) {
      statements.push(db.prepare(UPSERT_SQL[key].overwrite).bind(userId, JSON.stringify(records)));
    }
  }
  if (statements.length) await db.batch(statements);
}

// ---------------------------------------------------------------------------
// Import of local (IndexedDB) data
// ---------------------------------------------------------------------------

type Raw = Record<string, unknown>;

const asRaw = (value: unknown): Raw | undefined =>
  value && typeof value === "object" && !Array.isArray(value) ? (value as Raw) : undefined;

function cleanId(value: unknown) {
  return typeof value === "string" && value.trim() && value.length <= 200 ? value.trim() : undefined;
}

function cleanText(value: unknown, maxLength: number) {
  return typeof value === "string" && value.trim() ? value.trim().slice(0, maxLength) : undefined;
}

function cleanTimestamp(value: unknown) {
  return typeof value === "string" && value.length <= 40 && !Number.isNaN(Date.parse(value)) ? value : undefined;
}

function cleanPositive(value: unknown, max: number, integer: boolean) {
  const parsed = typeof value === "number" ? value : typeof value === "string" ? Number(value) : Number.NaN;
  if (!Number.isFinite(parsed) || parsed <= 0 || parsed > max) return undefined;
  const result = integer ? Math.round(parsed) : parsed;
  return result > 0 ? result : undefined;
}

const cleanDate = (value: unknown) => (isISODate(value) ? value : undefined);

function sanitizeRacket(value: unknown, now: string): Racket | undefined {
  const raw = asRaw(value);
  const id = cleanId(raw?.id);
  const name = cleanText(raw?.name, LIMITS.textLength);
  if (!raw || !id || !name) return undefined;
  const createdAt = cleanTimestamp(raw.createdAt) ?? now;
  const sortOrder = typeof raw.sortOrder === "number" && Number.isFinite(raw.sortOrder) ? Math.round(raw.sortOrder) : undefined;
  return compact({
    id,
    name,
    blade: cleanText(raw.blade, LIMITS.textLength) ?? "",
    status: isRacketStatus(raw.status) ? raw.status : "active",
    forehandRubberId: cleanId(raw.forehandRubberId),
    backhandRubberId: cleanId(raw.backhandRubberId),
    sortOrder,
    notes: cleanText(raw.notes, LIMITS.notesLength),
    gripType: isGripType(raw.gripType) ? raw.gripType : undefined,
    bladeWeightGrams: cleanPositive(raw.bladeWeightGrams, LIMITS.maxWeightGrams, false),
    totalWeightGrams: cleanPositive(raw.totalWeightGrams, LIMITS.maxWeightGrams, false),
    startedAt: cleanDate(raw.startedAt),
    initialPlayMinutes: cleanPositive(raw.initialPlayMinutes, LIMITS.maxInitialPlayMinutes, true),
    createdAt,
    updatedAt: cleanTimestamp(raw.updatedAt) ?? createdAt,
  });
}

function sanitizeRubber(value: unknown, now: string): Rubber | undefined {
  const raw = asRaw(value);
  const id = cleanId(raw?.id);
  const name = cleanText(raw?.name, LIMITS.textLength);
  if (!raw || !id || !name) return undefined;
  const createdAt = cleanTimestamp(raw.createdAt) ?? now;
  const quantity = cleanPositive(raw.quantity, LIMITS.maxQuantity, true);
  return compact({
    id,
    racketId: cleanId(raw.racketId),
    side: isRubberSide(raw.side) ? raw.side : undefined,
    name,
    label: cleanText(raw.label, LIMITS.labelLength),
    quantity: quantity && quantity > 1 ? quantity : undefined,
    hardness: cleanText(raw.hardness, LIMITS.hardnessLength),
    thicknessMm: cleanPositive(raw.thicknessMm, LIMITS.maxThicknessMm, false),
    weightGrams: cleanPositive(raw.weightGrams, LIMITS.maxWeightGrams, false),
    installedAt: cleanDate(raw.installedAt),
    mountedAt: cleanDate(raw.mountedAt),
    removedAt: cleanDate(raw.removedAt),
    history: sanitizeRubberHistory(raw.history),
    stashedAt: cleanDate(raw.stashedAt),
    storageAgingPercent: cleanPositive(raw.storageAgingPercent, LIMITS.maxStorageAgingPercent, true),
    boosted: raw.boosted === true,
    customCalendarDays: cleanPositive(raw.customCalendarDays, LIMITS.maxCalendarDays, true),
    customPlayMinutes: cleanPositive(raw.customPlayMinutes, LIMITS.maxPlayMinutes, true),
    initialPlayMinutes: cleanPositive(raw.initialPlayMinutes, LIMITS.maxInitialPlayMinutes, true),
    boostCycleDays: cleanPositive(raw.boostCycleDays, LIMITS.maxBoostCycleDays, true),
    notes: cleanText(raw.notes, LIMITS.notesLength),
    createdAt,
    updatedAt: cleanTimestamp(raw.updatedAt) ?? createdAt,
  });
}

function sanitizeBoostingLog(value: unknown, now: string): BoostingLog | undefined {
  const raw = asRaw(value);
  const id = cleanId(raw?.id);
  const rubberId = cleanId(raw?.rubberId);
  const date = cleanDate(raw?.date);
  if (!raw || !id || !rubberId || !date) return undefined;
  return compact({
    id,
    rubberId,
    date,
    boostNumber: cleanPositive(raw.boostNumber, 10_000, true) ?? 1,
    layers: cleanPositive(raw.layers, 1_000, true) ?? 1,
    notes: cleanText(raw.notes, LIMITS.notesLength),
    createdAt: cleanTimestamp(raw.createdAt) ?? now,
  });
}

function sanitizePlaySession(value: unknown, now: string): PlaySession | undefined {
  const raw = asRaw(value);
  const id = cleanId(raw?.id);
  const racketId = cleanId(raw?.racketId);
  const date = cleanDate(raw?.date);
  const durationMinutes = cleanPositive(raw?.durationMinutes, 10_000, true);
  if (!raw || !id || !racketId || !date || !durationMinutes) return undefined;
  return compact({
    id,
    racketId,
    date,
    durationMinutes,
    notes: cleanText(raw.notes, LIMITS.notesLength),
    createdAt: cleanTimestamp(raw.createdAt) ?? now,
  });
}

const SANITIZERS: { [K in EntityKey]: (value: unknown, now: string) => AppSnapshot[K][number] | undefined } = {
  rackets: sanitizeRacket,
  rubbers: sanitizeRubber,
  boostingLogs: sanitizeBoostingLog,
  playSessions: sanitizePlaySession,
};

export class ImportTooLargeError extends Error {}

/**
 * Merges a local IndexedDB export into the user's cloud data in one batch:
 * rackets / rubbers are upserted unless the cloud copy was edited more recently (`updated_at`),
 * boosting logs / sessions are inserted when missing, then boost numbers are recalculated.
 */
export async function importSnapshot(db: D1Database, userId: string, payload: Raw, now: string): Promise<SyncImportResponse> {
  const lists = Object.fromEntries(
    ENTITY_KEYS.map((key) => [key, Array.isArray(payload[key]) ? (payload[key] as unknown[]) : []]),
  ) as Record<EntityKey, unknown[]>;
  const total = ENTITY_KEYS.reduce((sum, key) => sum + lists[key].length, 0);
  if (total > MAX_IMPORT_RECORDS) throw new ImportTooLargeError(`一次最多导入 ${MAX_IMPORT_RECORDS} 条记录`);

  const response: SyncImportResponse = {
    received: { rackets: 0, rubbers: 0, boostingLogs: 0, playSessions: 0 },
    imported: { rackets: 0, rubbers: 0, boostingLogs: 0, playSessions: 0 },
    invalid: { rackets: 0, rubbers: 0, boostingLogs: 0, playSessions: 0 },
  };

  const statements: D1PreparedStatement[] = [];
  const statementKeys: EntityKey[] = [];
  for (const key of ENTITY_KEYS) {
    const records = new Map<string, object & { id: string }>();
    for (const item of lists[key]) {
      const record = SANITIZERS[key](item, now);
      if (record) records.set(record.id, record);
      else response.invalid[key] += 1;
    }
    response.received[key] = lists[key].length;
    for (const group of chunk([...records.values()])) {
      statements.push(db.prepare(UPSERT_SQL[key].newer).bind(userId, JSON.stringify(group)));
      statementKeys.push(key);
    }
  }
  if (!statements.length) return response;
  if (statementKeys.includes("boostingLogs")) statements.push(db.prepare(RENUMBER_BOOSTS_SQL).bind(userId));

  const results = await db.batch(statements);
  statementKeys.forEach((key, index) => {
    response.imported[key] += results[index].meta.changes ?? 0;
  });
  return response;
}
