/**
 * Pure domain logic shared by Local Mode (Dexie) and the Cloudflare Worker (D1).
 *
 * Every mutation is a *planner*: it receives the relevant slice of data as an {@link AppSnapshot},
 * validates the input and returns an {@link AppDataDelta}. Local Mode applies the delta to
 * IndexedDB; the Worker persists it to D1 and returns it so the client can merge it into its
 * in-memory snapshot. Keep this module free of runtime dependencies so `worker/` can import it.
 */
import {
  getRacketRubberId,
  getRubberMountedDate,
  getRubberQuantity,
  getRubberState,
  isGripType,
  RACKET_STATUSES,
  RUBBER_SIDES,
  type AppDataDelta,
  type AppSnapshot,
  type BoostingLog,
  type EntityKey,
  type GripType,
  type PlaySession,
  type Racket,
  type RacketStatus,
  type Rubber,
  type RubberPeriod,
  type RubberSide,
} from "./schema";

export class DomainError extends Error {
  readonly status: 400 | 404 | 409;

  constructor(message: string, status: 400 | 404 | 409 = 400) {
    super(message);
    this.name = "DomainError";
    this.status = status;
  }
}

export type DomainContext = {
  /** ISO timestamp used for `createdAt` / `updatedAt`. */
  now: string;
  /** Calendar date (`YYYY-MM-DD`) used when an input omits its date. */
  today: string;
  createId: (prefix: string) => string;
};

export type DomainResult = { delta: AppDataDelta; id?: string };
export type CreateResult = { delta: AppDataDelta; id: string };

// ---------------------------------------------------------------------------
// Inputs (shared by the store actions and the Worker request bodies)
// ---------------------------------------------------------------------------

export type RubberFields = {
  /** Model. */
  name: string;
  /** Optional custom name, e.g. `1号` / `比赛备用`. */
  label?: string;
  hardness?: string;
  thicknessMm?: number;
  /** Sheet weight in grams. */
  weightGrams?: number;
  /** A boosting rubber (灌油胶皮); most rubbers are not. */
  boosted?: boolean;
  customCalendarDays?: number;
  customPlayMinutes?: number;
  /** Play time before the rubber was recorded in the app, in minutes (counts toward its play life). */
  initialPlayMinutes?: number;
  boostCycleDays?: number;
  /** Calendar aging speed while stored in the inventory as a used sheet, in percent (default 50). */
  storageAgingPercent?: number;
  notes?: string;
};

/**
 * History of a sheet that was already in use when it was recorded ("已在用老胶皮" being mounted, or a
 * used sheet added to the inventory).
 */
export type UsedRubberHistory = {
  /** `YYYY-MM-DD` the sheet was first glued on; its calendar life starts here. */
  installedAt: string;
  /** Inventory only: `YYYY-MM-DD` the sheet was taken off and stored (default today); it ages more slowly from here. */
  stashedAt?: string;
  /** Boosted sheets: boosts done before recording (default 1), backfilled as boosting logs. */
  priorBoostCount?: number;
  /** Boosted sheets: date of the latest of those boosts (defaults to `installedAt`). */
  lastBoostDate?: string;
  /** Boosted sheets: layers of each backfilled boost (defaults to `initialBoostLayers`, then 1). */
  boostLayers?: number;
};

/** Where a rubber that is being mounted comes from. */
export type RubberSource =
  | {
      type: "new";
      rubber: RubberFields;
      /** When the new rubber is boosted, also log its first boost with this many layers. */
      initialBoostLayers?: number;
      /** Set when the sheet was already in use before it was recorded; omitted for a brand-new sheet. */
      used?: UsedRubberHistory;
    }
  | {
      type: "inventory";
      /** An inventory record; when it stands for several sheets (`quantity`), one is split off. */
      rubberId: string;
      /** Boosting rubbers: also log a boost with this many layers on the mount date (boosted before gluing). */
      boostLayers?: number;
    };

/** What happens to the rubber a replacement takes off: archived as retired, or kept in the inventory. */
export type OutgoingRubberAction = "retire" | "stash";

/** Optional blade details: grip, weights and service history. */
export type RacketSpecs = {
  gripType?: GripType;
  bladeWeightGrams?: number;
  totalWeightGrams?: number;
  /** `YYYY-MM-DD` the blade was first put into service. */
  startedAt?: string;
  /** Play time on the blade before it was recorded in the app, in minutes. */
  initialPlayMinutes?: number;
};

export type CreateRacketInput = RacketSpecs & {
  name: string;
  blade: string;
  /** Defaults to `active` when a rubber is mounted, otherwise `inventory` (bare blade). */
  status?: RacketStatus;
  notes?: string;
  sortOrder?: number;
  /** Installation date of the mounted rubbers (defaults to today). */
  installedAt?: string;
  forehand?: RubberSource;
  backhand?: RubberSource;
};

/** In every `Update*Input`, `undefined` keeps a field and `null` clears an optional field. */
export type UpdateRacketInput = {
  name?: string;
  blade?: string;
  status?: RacketStatus;
  notes?: string | null;
  sortOrder?: number | null;
  gripType?: GripType | null;
  bladeWeightGrams?: number | null;
  totalWeightGrams?: number | null;
  startedAt?: string | null;
  initialPlayMinutes?: number | null;
};

/**
 * Adds an unmounted rubber to the inventory: `quantity` identical brand-new sheets (default 1), or
 * one used sheet (`used`, e.g. taken off a racket earlier) whose history is backfilled.
 */
export type CreateRubberInput = RubberFields & {
  quantity?: number;
  used?: UsedRubberHistory;
};

export type UpdateRubberInput = {
  name?: string;
  label?: string | null;
  hardness?: string | null;
  thicknessMm?: number | null;
  weightGrams?: number | null;
  boosted?: boolean;
  customCalendarDays?: number | null;
  customPlayMinutes?: number | null;
  initialPlayMinutes?: number | null;
  boostCycleDays?: number | null;
  storageAgingPercent?: number | null;
  notes?: string | null;
  /** Brand-new inventory rubbers only: number of identical sheets (`null` = 1). */
  quantity?: number | null;
  /**
   * Mounted or retired rubbers: their installation date. Inventory rubbers: a date marks a used
   * sheet (first glued on that day), `null` makes it brand-new again.
   */
  installedAt?: string | null;
  /** Used inventory sheets only: the day they were taken off and stored. */
  stashedAt?: string | null;
  /** A date retires a mounted rubber (its racket slot is freed); `null` restores a retired one. */
  removedAt?: string | null;
};

export type ReplaceRubberInput = {
  side: RubberSide;
  /**
   * Change date: `removedAt` of the outgoing rubber and `installedAt` of the new one (for a used
   * sheet recorded with an earlier `installedAt`, its `mountedAt`). Defaults to today.
   */
  date?: string;
  source: RubberSource;
  /** What happens to the rubber taken off (default `retire`). */
  outgoing?: OutgoingRubberAction;
};

/** 「放回囤货」: `date` the mounted rubber is taken off (default today; ignored for retired rubbers). */
export type StashRubberInput = {
  date?: string;
};

export type CreatePlaySessionInput = {
  racketId: string;
  date: string;
  durationMinutes: number;
  notes?: string;
};

export type UpdatePlaySessionInput = {
  racketId?: string;
  date?: string;
  durationMinutes?: number;
  notes?: string | null;
};

export type CreateBoostingLogInput = {
  rubberId: string;
  date: string;
  layers: number;
  notes?: string;
};

export type UpdateBoostingLogInput = {
  date?: string;
  layers?: number;
  notes?: string | null;
};

export const LIMITS = {
  textLength: 120,
  /** Custom rubber name. */
  labelLength: 40,
  hardnessLength: 20,
  notesLength: 1000,
  maxThicknessMm: 10,
  maxCalendarDays: 3650,
  maxPlayMinutes: 100_000,
  maxBoostCycleDays: 365,
  maxLayers: 20,
  maxSessionMinutes: 24 * 60,
  maxWeightGrams: 1000,
  /** Pre-recorded play time (10 000 h). */
  maxInitialPlayMinutes: 600_000,
  maxPriorBoosts: 100,
  /** Identical sheets in one inventory record. */
  maxQuantity: 99,
  /** Storage aging speed, percent of normal calendar aging. */
  maxStorageAgingPercent: 100,
  /** Completed periods kept in a rubber's timeline. */
  maxHistoryPeriods: 200,
} as const;

/** `notes` of the boosting log created together with a new boosted rubber. */
export const INITIAL_BOOST_NOTE = "Initial boost";
/** `notes` of the boost logged when a used boosting rubber is mounted again from the inventory. */
export const MOUNT_BOOST_NOTE = "Boost on mounting";
/** `notes` of the latest boost backfilled for a used sheet (its real date). */
export const BACKFILLED_BOOST_NOTE = "Backfilled boost";
/** `notes` of earlier backfilled boosts, spread evenly between `installedAt` and the latest one. */
export const ESTIMATED_BOOST_NOTE = "Backfilled boost (estimated date)";

// ---------------------------------------------------------------------------
// Validation helpers (inputs may be untrusted JSON on the Worker)
// ---------------------------------------------------------------------------

const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

export function isISODate(value: unknown): value is string {
  if (typeof value !== "string" || !DATE_PATTERN.test(value)) return false;
  const [year, month, day] = value.split("-").map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  return date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day;
}

function isBlank(value: unknown) {
  return value === undefined || value === null || (typeof value === "string" && value.trim() === "");
}

function toNumber(value: unknown) {
  if (typeof value === "number") return value;
  if (typeof value === "string" && value.trim()) return Number(value);
  return Number.NaN;
}

export function requireText(value: unknown, label: string, maxLength: number = LIMITS.textLength): string {
  if (typeof value !== "string" || !value.trim()) throw new DomainError(`请填写${label}`);
  const text = value.trim();
  if (text.length > maxLength) throw new DomainError(`${label}不能超过 ${maxLength} 个字符`);
  return text;
}

export function optionalText(value: unknown, label: string, maxLength: number = LIMITS.notesLength) {
  return isBlank(value) ? undefined : requireText(value, label, maxLength);
}

export function requireDate(value: unknown, label: string): string {
  if (!isISODate(value)) throw new DomainError(`请选择有效的${label}`);
  return value;
}

export function optionalDate(value: unknown, label: string) {
  return isBlank(value) ? undefined : requireDate(value, label);
}

export function requirePositiveNumber(value: unknown, label: string, max: number): number {
  const parsed = toNumber(value);
  if (!Number.isFinite(parsed) || parsed <= 0) throw new DomainError(`${label}必须大于 0`);
  if (parsed > max) throw new DomainError(`${label}不能超过 ${max}`);
  return parsed;
}

export function optionalPositiveNumber(value: unknown, label: string, max: number) {
  return isBlank(value) ? undefined : requirePositiveNumber(value, label, max);
}

export function requirePositiveInt(value: unknown, label: string, max: number): number {
  const rounded = Math.round(requirePositiveNumber(value, label, max));
  if (rounded < 1) throw new DomainError(`${label}至少为 1`);
  return rounded;
}

export function optionalPositiveInt(value: unknown, label: string, max: number) {
  return isBlank(value) ? undefined : requirePositiveInt(value, label, max);
}

function optionalInteger(value: unknown, label: string) {
  if (isBlank(value)) return undefined;
  const parsed = toNumber(value);
  if (!Number.isFinite(parsed)) throw new DomainError(`${label}必须是数字`);
  return Math.round(parsed);
}

/** Pre-recorded play time in minutes: blank or 0 leaves it unset, negatives are rejected. */
function optionalMinutes(value: unknown, label: string, max: number) {
  if (isBlank(value)) return undefined;
  const parsed = toNumber(value);
  if (!Number.isFinite(parsed)) throw new DomainError(`${label}必须是数字`);
  if (parsed < 0) throw new DomainError(`${label}不能为负数`);
  if (parsed > max) throw new DomainError(`${label}不能超过 ${Math.round(max / 60)} 小时`);
  const rounded = Math.round(parsed);
  return rounded > 0 ? rounded : undefined;
}

function optionalGripType(value: unknown): GripType | undefined {
  if (isBlank(value)) return undefined;
  if (!isGripType(value)) throw new DomainError("握拍类型无效");
  return value;
}

function requireBoolean(value: unknown, label: string): boolean {
  if (typeof value !== "boolean") throw new DomainError(`${label}无效`);
  return value;
}

function requireId(value: unknown, label: string): string {
  if (typeof value !== "string" || !value.trim()) throw new DomainError(`请选择${label}`);
  return value.trim();
}

function requireSide(value: unknown): RubberSide {
  if (!RUBBER_SIDES.includes(value as RubberSide)) throw new DomainError("请选择正手或反手");
  return value as RubberSide;
}

function requireRacketStatus(value: unknown): RacketStatus {
  if (!RACKET_STATUSES.includes(value as RacketStatus)) throw new DomainError("球拍状态无效");
  return value as RacketStatus;
}

function asObject(value: unknown, label: string): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new DomainError(`${label}无效`);
  return value as Record<string, unknown>;
}

/** Applies one patch value: `undefined` keeps `current`, `null` clears it, anything else is parsed. */
function patch<T>(current: T | undefined, value: unknown, parse: (value: unknown) => T | undefined) {
  if (value === undefined) return current;
  if (value === null) return undefined;
  return parse(value);
}

/** Drops `undefined` / `null` properties so records match the optional-field model. */
export function compact<T extends object>(value: T): { [K in keyof T]: Exclude<T[K], null> } {
  const result: Record<string, unknown> = {};
  for (const [key, entry] of Object.entries(value)) {
    if (entry !== undefined && entry !== null) result[key] = entry;
  }
  return result as { [K in keyof T]: Exclude<T[K], null> };
}

// ---------------------------------------------------------------------------
// Deltas
// ---------------------------------------------------------------------------

type EntityRecord = {
  rackets: Racket;
  rubbers: Rubber;
  boostingLogs: BoostingLog;
  playSessions: PlaySession;
};

export function createEmptySnapshot(): AppSnapshot {
  return { rackets: [], rubbers: [], boostingLogs: [], playSessions: [] };
}

export function createEmptyDelta(): AppDataDelta {
  return {
    upserts: createEmptySnapshot(),
    deletes: { rackets: [], rubbers: [], boostingLogs: [], playSessions: [] },
  };
}

class DeltaBuilder {
  private readonly upserts: Record<EntityKey, Map<string, { id: string }>> = {
    rackets: new Map(),
    rubbers: new Map(),
    boostingLogs: new Map(),
    playSessions: new Map(),
  };

  private readonly deletes: Record<EntityKey, Set<string>> = {
    rackets: new Set(),
    rubbers: new Set(),
    boostingLogs: new Set(),
    playSessions: new Set(),
  };

  put<K extends EntityKey>(key: K, record: EntityRecord[K]) {
    this.deletes[key].delete(record.id);
    this.upserts[key].set(record.id, record);
  }

  remove(key: EntityKey, id: string) {
    this.upserts[key].delete(id);
    this.deletes[key].add(id);
  }

  /** Latest staged version of a record within this plan, or the given snapshot copy. */
  current<K extends EntityKey>(key: K, record: EntityRecord[K]): EntityRecord[K] {
    return (this.upserts[key].get(record.id) as EntityRecord[K] | undefined) ?? record;
  }

  build(): AppDataDelta {
    return {
      upserts: {
        rackets: [...this.upserts.rackets.values()] as Racket[],
        rubbers: [...this.upserts.rubbers.values()] as Rubber[],
        boostingLogs: [...this.upserts.boostingLogs.values()] as BoostingLog[],
        playSessions: [...this.upserts.playSessions.values()] as PlaySession[],
      },
      deletes: {
        rackets: [...this.deletes.rackets],
        rubbers: [...this.deletes.rubbers],
        boostingLogs: [...this.deletes.boostingLogs],
        playSessions: [...this.deletes.playSessions],
      },
    };
  }
}

function applyTableDelta<T extends { id: string }>(rows: T[], upserts: T[] = [], deletes: string[] = []): T[] {
  if (!upserts.length && !deletes.length) return rows;
  const removed = new Set(deletes);
  const pending = new Map(upserts.map((row) => [row.id, row]));
  const next: T[] = [];
  for (const row of rows) {
    if (removed.has(row.id)) continue;
    const replacement = pending.get(row.id);
    if (replacement) {
      next.push(replacement);
      pending.delete(row.id);
    } else {
      next.push(row);
    }
  }
  for (const row of pending.values()) {
    if (!removed.has(row.id)) next.push(row);
  }
  return next;
}

/** Returns a new snapshot with the delta applied (unchanged tables keep their identity). */
export function applyDelta(snapshot: AppSnapshot, delta: AppDataDelta): AppSnapshot {
  return {
    rackets: applyTableDelta(snapshot.rackets, delta.upserts?.rackets, delta.deletes?.rackets),
    rubbers: applyTableDelta(snapshot.rubbers, delta.upserts?.rubbers, delta.deletes?.rubbers),
    boostingLogs: applyTableDelta(snapshot.boostingLogs, delta.upserts?.boostingLogs, delta.deletes?.boostingLogs),
    playSessions: applyTableDelta(snapshot.playSessions, delta.upserts?.playSessions, delta.deletes?.playSessions),
  };
}

// ---------------------------------------------------------------------------
// Selectors
// ---------------------------------------------------------------------------

function compareText(left: string, right: string) {
  return left < right ? -1 : left > right ? 1 : 0;
}

/** Chronological order behind `boostNumber`: date, creation time, id (mirrored by the Worker's SQL). */
export function compareBoostingLogs(left: BoostingLog, right: BoostingLog) {
  return compareText(left.date, right.date) || compareText(left.createdAt, right.createdAt) || compareText(left.id, right.id);
}

export function getMountedRubber(snapshot: Pick<AppSnapshot, "rubbers">, racket: Racket, side: RubberSide) {
  const rubberId = getRacketRubberId(racket, side);
  return rubberId ? snapshot.rubbers.find((rubber) => rubber.id === rubberId) : undefined;
}

/**
 * Unmounted rubbers in the inventory: brand-new stock first (newest first), then used sheets taken
 * off a racket to be mounted again (most recently put back first).
 */
export function getInventoryRubbers(snapshot: Pick<AppSnapshot, "rubbers">) {
  const usedRank = (rubber: Rubber) => (rubber.installedAt ? 1 : 0);
  const sortKey = (rubber: Rubber) => (rubber.installedAt ? (rubber.updatedAt ?? rubber.createdAt) : rubber.createdAt);
  return snapshot.rubbers
    .filter((rubber) => getRubberState(rubber) === "inventory")
    .sort((left, right) => usedRank(left) - usedRank(right) || compareText(sortKey(right), sortKey(left)));
}

/** Sheets in the inventory, counting the `quantity` of brand-new stock records. */
export function countInventorySheets(snapshot: Pick<AppSnapshot, "rubbers">) {
  return snapshot.rubbers.reduce((total, rubber) => (getRubberState(rubber) === "inventory" ? total + getRubberQuantity(rubber) : total), 0);
}

/** Rubbers previously used on a racket, most recently retired first. */
export function getRetiredRubbers(snapshot: Pick<AppSnapshot, "rubbers">, racketId: string) {
  return snapshot.rubbers
    .filter((rubber) => rubber.racketId === racketId && getRubberState(rubber) === "retired")
    .sort((left, right) => compareText(right.removedAt ?? "", left.removedAt ?? ""));
}

/** A rubber's boosting logs, newest first. */
export function getRubberBoostingLogs(snapshot: Pick<AppSnapshot, "boostingLogs">, rubberId: string) {
  return snapshot.boostingLogs.filter((log) => log.rubberId === rubberId).sort((left, right) => compareBoostingLogs(right, left));
}

// ---------------------------------------------------------------------------
// Planner internals
// ---------------------------------------------------------------------------

function findRacket(snapshot: AppSnapshot, id: unknown) {
  const racketId = requireId(id, "球拍");
  const racket = snapshot.rackets.find((item) => item.id === racketId);
  if (!racket) throw new DomainError("没有找到这块球拍", 404);
  return racket;
}

function findRubber(snapshot: AppSnapshot, id: unknown) {
  const rubberId = requireId(id, "胶皮");
  const rubber = snapshot.rubbers.find((item) => item.id === rubberId);
  if (!rubber) throw new DomainError("没有找到这张胶皮", 404);
  return rubber;
}

function findPlaySession(snapshot: AppSnapshot, id: unknown) {
  const sessionId = requireId(id, "打球记录");
  const session = snapshot.playSessions.find((item) => item.id === sessionId);
  if (!session) throw new DomainError("没有找到这条打球记录", 404);
  return session;
}

function findBoostingLog(snapshot: AppSnapshot, id: unknown) {
  const logId = requireId(id, "灌油记录");
  const log = snapshot.boostingLogs.find((item) => item.id === logId);
  if (!log) throw new DomainError("没有找到这条灌油记录", 404);
  return log;
}

function withSlot(racket: Racket, side: RubberSide, rubberId: string | undefined): Racket {
  return compact(side === "forehand" ? { ...racket, forehandRubberId: rubberId } : { ...racket, backhandRubberId: rubberId });
}

/** Stages every racket whose slot points at `rubberId` with that slot emptied. */
function stageFreedSlots(snapshot: AppSnapshot, builder: DeltaBuilder, rubberId: string, ctx: DomainContext) {
  for (const snapshotRacket of snapshot.rackets) {
    let racket = builder.current("rackets", snapshotRacket);
    if (racket.forehandRubberId !== rubberId && racket.backhandRubberId !== rubberId) continue;
    if (racket.forehandRubberId === rubberId) racket = withSlot(racket, "forehand", undefined);
    if (racket.backhandRubberId === rubberId) racket = withSlot(racket, "backhand", undefined);
    builder.put("rackets", { ...racket, updatedAt: ctx.now });
  }
}

/** Re-numbers one rubber's logs 1..n chronologically and stages each log whose number changed. */
function stageRenumberedLogs(builder: DeltaBuilder, logs: BoostingLog[]) {
  [...logs].sort(compareBoostingLogs).forEach((log, index) => {
    const boostNumber = index + 1;
    if (log.boostNumber !== boostNumber) builder.put("boostingLogs", { ...log, boostNumber });
  });
}

function logsOfRubber(snapshot: AppSnapshot, rubberId: string) {
  return snapshot.boostingLogs.filter((log) => log.rubberId === rubberId);
}

const parseStorageAgingPercent = (value: unknown) =>
  optionalPositiveInt(value, "囤货老化速度", LIMITS.maxStorageAgingPercent);

function normalizeRubberFields(input: unknown) {
  const fields = asObject(input, "胶皮信息");
  return compact({
    name: requireText(fields.name, "胶皮型号"),
    label: optionalText(fields.label, "自定义名称", LIMITS.labelLength),
    hardness: optionalText(fields.hardness, "硬度", LIMITS.hardnessLength),
    thicknessMm: optionalPositiveNumber(fields.thicknessMm, "厚度", LIMITS.maxThicknessMm),
    weightGrams: optionalPositiveNumber(fields.weightGrams, "胶皮重量", LIMITS.maxWeightGrams),
    boosted: isBlank(fields.boosted) ? false : requireBoolean(fields.boosted, "灌油状态"),
    customCalendarDays: optionalPositiveInt(fields.customCalendarDays, "日历寿命天数", LIMITS.maxCalendarDays),
    customPlayMinutes: optionalPositiveInt(fields.customPlayMinutes, "打球时长上限", LIMITS.maxPlayMinutes),
    initialPlayMinutes: optionalMinutes(fields.initialPlayMinutes, "此前已打时长", LIMITS.maxInitialPlayMinutes),
    boostCycleDays: optionalPositiveInt(fields.boostCycleDays, "复灌周期", LIMITS.maxBoostCycleDays),
    storageAgingPercent: parseStorageAgingPercent(fields.storageAgingPercent),
    notes: optionalText(fields.notes, "备注"),
  });
}

/**
 * Keeps the well-formed periods of an untrusted rubber timeline (D1 rows, imported local data);
 * `undefined` when none are left.
 */
export function sanitizeRubberHistory(value: unknown): RubberPeriod[] | undefined {
  if (!Array.isArray(value)) return undefined;
  const periods: RubberPeriod[] = [];
  for (const item of value.slice(-LIMITS.maxHistoryPeriods)) {
    if (!item || typeof item !== "object") continue;
    const { kind, racketId, side, from, to } = item as Record<string, unknown>;
    if (!isISODate(from) || !isISODate(to) || to < from) continue;
    if (kind === "stored") periods.push({ kind, from, to });
    else if (kind === "mounted" && typeof racketId === "string" && racketId && RUBBER_SIDES.includes(side as RubberSide)) {
      periods.push({ kind, racketId, side: side as RubberSide, from, to });
    }
  }
  return periods.length ? periods : undefined;
}

/** `history` with `period` appended (zero-length stored stretches are skipped). */
function appendPeriod(history: RubberPeriod[] | undefined, period: RubberPeriod | undefined) {
  if (!period || (period.kind === "stored" && period.from >= period.to)) return history;
  const next = [...(history ?? []), period];
  if (next.length > LIMITS.maxHistoryPeriods) throw new DomainError("这张胶皮的贴拍 / 囤货记录太多了");
  return next;
}

/** Minutes of `sessions` played on `racketId` within any of `stints` (each session once). */
function stintMinutes(sessions: PlaySession[], racketId: string, stints: { from: string; to?: string }[]) {
  return sessions.reduce(
    (total, session) =>
      session.racketId === racketId && stints.some((stint) => session.date >= stint.from && (!stint.to || session.date <= stint.to))
        ? total + session.durationMinutes
        : total,
    0,
  );
}

const DAY_MS = 86_400_000;
const isoToUtc = (date: string) => Date.UTC(Number(date.slice(0, 4)), Number(date.slice(5, 7)) - 1, Number(date.slice(8, 10)));
const utcToIso = (time: number) => new Date(time).toISOString().slice(0, 10);

/** `now` shifted by a few milliseconds, so logs created together keep a stable chronological order. */
function offsetTimestamp(now: string, milliseconds: number) {
  const time = Date.parse(now);
  return Number.isNaN(time) ? now : new Date(time + milliseconds).toISOString();
}

type UsedRubberPlan = { installedAt: string; boosts: { date: string; layers: number; notes: string }[] };

/**
 * Validates the history of a used sheet. For boosted sheets, `priorBoostCount` boosts are spread
 * evenly from `installedAt` (first boost before gluing) to `lastBoostDate` (the only real date).
 */
function normalizeUsedHistory(input: unknown, boosted: boolean, fallbackLayers: unknown): UsedRubberPlan | undefined {
  if (input === undefined || input === null || input === false) return undefined;
  const used = asObject(input, "老胶皮信息");
  const installedAt = requireDate(used.installedAt, "投入使用日期");
  if (!boosted) return { installedAt, boosts: [] };

  const count = optionalPositiveInt(used.priorBoostCount, "历史灌油次数", LIMITS.maxPriorBoosts) ?? 1;
  const lastBoostDate = optionalDate(used.lastBoostDate, "上次灌油日期") ?? installedAt;
  if (lastBoostDate < installedAt) throw new DomainError("上次灌油日期不能早于投入使用日期");
  const layers =
    optionalPositiveInt(isBlank(used.boostLayers) ? fallbackLayers : used.boostLayers, "灌油层数", LIMITS.maxLayers) ?? 1;

  const start = isoToUtc(installedAt);
  const spanDays = Math.round((isoToUtc(lastBoostDate) - start) / DAY_MS);
  const boosts = Array.from({ length: count }, (_, index) =>
    index === count - 1
      ? { date: lastBoostDate, layers, notes: BACKFILLED_BOOST_NOTE }
      : { date: utcToIso(start + Math.round((spanDays * index) / (count - 1)) * DAY_MS), layers, notes: ESTIMATED_BOOST_NOTE },
  );
  return { installedAt, boosts };
}

/**
 * `trackMount`: the racket may already have history (replace / mount flows). A used sheet recorded
 * with an earlier `installedAt` then gets `mountedAt = date`, so the racket's earlier sessions are not
 * counted on top of the sheet's `initialPlayMinutes`.
 */
type MountTarget = { racketId: string; side: RubberSide; date: string; trackMount?: boolean };

/** Stages the backfilled boosts of a used sheet as its boosting logs #1..n. */
function stageBackfilledBoosts(builder: DeltaBuilder, rubberId: string, boosts: UsedRubberPlan["boosts"], ctx: DomainContext) {
  boosts.forEach((boost, index) => {
    builder.put("boostingLogs", {
      id: ctx.createId("boost"),
      rubberId,
      date: boost.date,
      boostNumber: index + 1,
      layers: boost.layers,
      notes: boost.notes,
      createdAt: offsetTimestamp(ctx.now, index),
    });
  });
}

/** Stages a boost logged when a rubber is mounted, renumbering the rubber's earlier logs. */
function stageMountBoost(snapshot: AppSnapshot, builder: DeltaBuilder, rubberId: string, date: string, layers: number, notes: string, ctx: DomainContext) {
  const log: BoostingLog = { id: ctx.createId("boost"), rubberId, date, boostNumber: 0, layers, notes, createdAt: ctx.now };
  stageRenumberedLogs(builder, [...logsOfRubber(snapshot, rubberId), log]);
}

/** Stages the rubber described by `sourceInput` as mounted on `target`; returns its id. */
function stageMount(snapshot: AppSnapshot, builder: DeltaBuilder, target: MountTarget, sourceInput: unknown, ctx: DomainContext) {
  const source = asObject(sourceInput, "胶皮来源");

  if (source.type === "new") {
    const fields = normalizeRubberFields(source.rubber);
    const used = normalizeUsedHistory(source.used, fields.boosted, source.initialBoostLayers);
    if (used && target.trackMount && used.installedAt > target.date) {
      throw new DomainError("老胶皮的投入使用日期不能晚于贴拍日期");
    }
    const rubber: Rubber = compact({
      ...fields,
      id: ctx.createId("rubber"),
      racketId: target.racketId,
      side: target.side,
      installedAt: used?.installedAt ?? target.date,
      mountedAt: used && target.trackMount && used.installedAt < target.date ? target.date : undefined,
      createdAt: ctx.now,
      updatedAt: ctx.now,
    });
    builder.put("rubbers", rubber);

    if (used) {
      // A used sheet's past boosts replace the "initial boost" of a brand-new one.
      stageBackfilledBoosts(builder, rubber.id, used.boosts, ctx);
      return rubber.id;
    }

    const layers = optionalPositiveInt(source.initialBoostLayers, "灌油层数", LIMITS.maxLayers);
    if (rubber.boosted && layers) {
      builder.put("boostingLogs", {
        id: ctx.createId("boost"),
        rubberId: rubber.id,
        date: target.date,
        boostNumber: 1,
        layers,
        notes: INITIAL_BOOST_NOTE,
        createdAt: ctx.now,
      });
    }
    return rubber.id;
  }

  if (source.type === "inventory") {
    const stock = builder.current("rubbers", findRubber(snapshot, source.rubberId));
    if (getRubberState(stock) !== "inventory") throw new DomainError("这张胶皮已经贴在球拍上或已退役", 409);
    const layers = optionalPositiveInt(source.boostLayers, "贴拍灌油层数", LIMITS.maxLayers);
    // A used sheet keeps its first installation date and its timeline: the stored stretch ends today
    // and sessions of the new racket count from the mount date.
    const firstInstalled = stock.installedAt;
    if (firstInstalled && target.date < firstInstalled) throw new DomainError("贴拍日期不能早于这张胶皮首次贴拍的日期");
    if (stock.stashedAt && target.date < stock.stashedAt) throw new DomainError("贴拍日期不能早于这张胶皮拆下放回囤货的日期");
    const placement = {
      racketId: target.racketId,
      side: target.side,
      installedAt: firstInstalled ?? target.date,
      mountedAt: firstInstalled && firstInstalled < target.date ? target.date : undefined,
      history: appendPeriod(stock.history, stock.stashedAt ? { kind: "stored", from: stock.stashedAt, to: target.date } : undefined),
      stashedAt: undefined,
      boosted: stock.boosted || Boolean(layers),
      quantity: undefined,
      updatedAt: ctx.now,
    };

    const count = getRubberQuantity(stock);
    let rubberId = stock.id;
    if (count > 1) {
      // Split one sheet off the stock record; the rest stays in the inventory.
      rubberId = ctx.createId("rubber");
      builder.put("rubbers", compact({ ...stock, ...placement, id: rubberId, createdAt: ctx.now }));
      builder.put("rubbers", compact({ ...stock, quantity: count - 1 > 1 ? count - 1 : undefined, updatedAt: ctx.now }));
    } else {
      builder.put("rubbers", compact({ ...stock, ...placement }));
    }
    if (layers) {
      const notes = firstInstalled ? MOUNT_BOOST_NOTE : INITIAL_BOOST_NOTE;
      stageMountBoost(snapshot, builder, rubberId, target.date, layers, notes, ctx);
    }
    return rubberId;
  }

  throw new DomainError("胶皮来源无效");
}

/**
 * Stages a mounted (or retired) rubber back in the inventory as a used sheet taken off on `endDate`.
 * Its stint on the racket goes into its timeline, so that racket's sessions from the stint keep
 * counting toward its play time (also ones logged later); from `endDate` it ages at its storage
 * speed. `installedAt` and its boosting logs stay. Racket slots are left to the caller.
 */
function stageStash(builder: DeltaBuilder, rubber: Rubber, endDate: string, ctx: DomainContext) {
  const from = getRubberMountedDate(rubber) ?? endDate;
  const stint: RubberPeriod | undefined =
    rubber.racketId && rubber.side ? { kind: "mounted", racketId: rubber.racketId, side: rubber.side, from, to: endDate } : undefined;
  builder.put(
    "rubbers",
    compact({
      ...rubber,
      racketId: undefined,
      side: undefined,
      mountedAt: undefined,
      removedAt: undefined,
      quantity: undefined,
      installedAt: rubber.installedAt ?? endDate,
      history: appendPeriod(rubber.history, stint),
      stashedAt: endDate,
      updatedAt: ctx.now,
    }),
  );
}

function parseOutgoingAction(value: unknown): OutgoingRubberAction {
  if (isBlank(value) || value === "retire") return "retire";
  if (value === "stash") return "stash";
  throw new DomainError("旧胶皮的去向无效");
}

function nextSortOrder(rackets: Racket[]) {
  return rackets.reduce((max, racket) => Math.max(max, racket.sortOrder ?? 0), 0) + 1;
}

// ---------------------------------------------------------------------------
// Planners: rackets
// ---------------------------------------------------------------------------

const parseBladeWeight = (value: unknown) => optionalPositiveNumber(value, "底板重量", LIMITS.maxWeightGrams);
const parseTotalWeight = (value: unknown) => optionalPositiveNumber(value, "整拍重量", LIMITS.maxWeightGrams);
const parseStartedAt = (value: unknown) => optionalDate(value, "底板启用日期");
const parseBladeMinutes = (value: unknown) => optionalMinutes(value, "底板此前已打时长", LIMITS.maxInitialPlayMinutes);

/** Needs: all rackets (sort order) and any inventory rubbers referenced by the sources. */
export function planCreateRacket(snapshot: AppSnapshot, input: CreateRacketInput, ctx: DomainContext): CreateResult {
  const builder = new DeltaBuilder();
  const id = ctx.createId("racket");
  const date = optionalDate(input.installedAt, "安装日期") ?? ctx.today;
  const hasRubber = Boolean(input.forehand || input.backhand);

  const racket: Racket = compact({
    id,
    name: requireText(input.name, "球拍名"),
    blade: requireText(input.blade, "底板"),
    status: isBlank(input.status) ? (hasRubber ? "active" : "inventory") : requireRacketStatus(input.status),
    notes: optionalText(input.notes, "备注"),
    sortOrder: optionalInteger(input.sortOrder, "排序") ?? nextSortOrder(snapshot.rackets),
    gripType: optionalGripType(input.gripType),
    bladeWeightGrams: parseBladeWeight(input.bladeWeightGrams),
    totalWeightGrams: parseTotalWeight(input.totalWeightGrams),
    startedAt: parseStartedAt(input.startedAt),
    initialPlayMinutes: parseBladeMinutes(input.initialPlayMinutes),
    createdAt: ctx.now,
    updatedAt: ctx.now,
  });

  if (input.forehand) {
    racket.forehandRubberId = stageMount(snapshot, builder, { racketId: id, side: "forehand", date }, input.forehand, ctx);
  }
  if (input.backhand) {
    racket.backhandRubberId = stageMount(snapshot, builder, { racketId: id, side: "backhand", date }, input.backhand, ctx);
  }

  builder.put("rackets", racket);
  return { delta: builder.build(), id };
}

/** Needs: the racket. Rubber slots change only through replace / retire / delete flows. */
export function planUpdateRacket(snapshot: AppSnapshot, id: string, input: UpdateRacketInput, ctx: DomainContext): DomainResult {
  const racket = findRacket(snapshot, id);
  const builder = new DeltaBuilder();
  builder.put(
    "rackets",
    compact({
      ...racket,
      name: input.name === undefined ? racket.name : requireText(input.name, "球拍名"),
      blade: input.blade === undefined ? racket.blade : requireText(input.blade, "底板"),
      status: input.status === undefined ? racket.status : requireRacketStatus(input.status),
      notes: patch(racket.notes, input.notes, (value) => optionalText(value, "备注")),
      sortOrder: patch(racket.sortOrder, input.sortOrder, (value) => optionalInteger(value, "排序")),
      gripType: patch(racket.gripType, input.gripType, optionalGripType),
      bladeWeightGrams: patch(racket.bladeWeightGrams, input.bladeWeightGrams, parseBladeWeight),
      totalWeightGrams: patch(racket.totalWeightGrams, input.totalWeightGrams, parseTotalWeight),
      startedAt: patch(racket.startedAt, input.startedAt, parseStartedAt),
      initialPlayMinutes: patch(racket.initialPlayMinutes, input.initialPlayMinutes, parseBladeMinutes),
      updatedAt: ctx.now,
    }),
  );
  return { delta: builder.build() };
}

/**
 * Deletes the racket with all its rubbers (mounted + retired), their boosting logs and its sessions.
 * Rubbers that were on it earlier and are elsewhere now keep that play time: their stints on it are
 * folded into `initialPlayMinutes` before its sessions go.
 * Needs: the racket, its rubbers and their logs, its sessions, and rubbers with a timeline.
 */
export function planDeleteRacket(snapshot: AppSnapshot, id: string, ctx?: DomainContext): DomainResult {
  const racket = findRacket(snapshot, id);
  const builder = new DeltaBuilder();
  const rubberIds = new Set(snapshot.rubbers.filter((rubber) => rubber.racketId === racket.id).map((rubber) => rubber.id));
  const sessions = snapshot.playSessions.filter((session) => session.racketId === racket.id);

  for (const rubber of snapshot.rubbers) {
    if (rubberIds.has(rubber.id)) continue;
    const stints = (rubber.history ?? []).filter((period) => period.kind === "mounted" && period.racketId === racket.id);
    if (!stints.length) continue;
    const minutes = Math.round(Math.max(0, rubber.initialPlayMinutes ?? 0)) + stintMinutes(sessions, racket.id, stints);
    builder.put(
      "rubbers",
      compact({
        ...rubber,
        history: rubber.history?.filter((period) => !stints.includes(period)),
        initialPlayMinutes: minutes > 0 ? Math.min(minutes, LIMITS.maxInitialPlayMinutes) : undefined,
        updatedAt: ctx?.now ?? rubber.updatedAt,
      }),
    );
  }

  builder.remove("rackets", racket.id);
  rubberIds.forEach((rubberId) => builder.remove("rubbers", rubberId));
  snapshot.boostingLogs.filter((log) => rubberIds.has(log.rubberId)).forEach((log) => builder.remove("boostingLogs", log.id));
  sessions.forEach((session) => builder.remove("playSessions", session.id));
  return { delta: builder.build() };
}

// ---------------------------------------------------------------------------
// Planners: rubbers
// ---------------------------------------------------------------------------

/**
 * Adds an unmounted rubber to the inventory: `quantity` identical brand-new sheets in one record, or
 * a single used sheet (`used`) whose installation date, take-off date and past boosts are backfilled.
 */
export function planCreateRubber(_snapshot: AppSnapshot, input: CreateRubberInput, ctx: DomainContext): CreateResult {
  const builder = new DeltaBuilder();
  const raw = asObject(input, "胶皮信息");
  const { initialPlayMinutes, ...fields } = normalizeRubberFields(raw);
  const used = normalizeUsedHistory(raw.used, fields.boosted, undefined);
  const quantity = optionalPositiveInt(raw.quantity, "数量", LIMITS.maxQuantity) ?? 1;
  if (used && quantity > 1) throw new DomainError("用过的胶皮请逐张登记，数量只能为 1");
  let stashedAt: string | undefined;
  if (used) {
    stashedAt = optionalDate(asObject(raw.used, "老胶皮信息").stashedAt, "拆下日期") ?? ctx.today;
    if (stashedAt < used.installedAt) throw new DomainError("拆下日期不能早于首次贴拍日期");
  }

  const rubber: Rubber = compact({
    ...fields,
    id: ctx.createId("rubber"),
    quantity: quantity > 1 ? quantity : undefined,
    installedAt: used?.installedAt,
    stashedAt,
    // Only a used sheet has play time already.
    initialPlayMinutes: used ? initialPlayMinutes : undefined,
    createdAt: ctx.now,
    updatedAt: ctx.now,
  });
  builder.put("rubbers", rubber);
  if (used) stageBackfilledBoosts(builder, rubber.id, used.boosts, ctx);
  return { delta: builder.build(), id: rubber.id };
}

/**
 * Edits a rubber. Setting `removedAt` on a mounted rubber retires it and frees its racket slot;
 * clearing `removedAt` puts a retired rubber back on its slot when that slot is empty. Inventory
 * rubbers may change their stock `quantity` (brand-new only), first installation date and take-off
 * date (used). Needs: the rubber, rackets pointing at it and its own racket.
 */
export function planUpdateRubber(snapshot: AppSnapshot, id: string, input: UpdateRubberInput, ctx: DomainContext): DomainResult {
  const rubber = findRubber(snapshot, id);
  const state = getRubberState(rubber);
  const builder = new DeltaBuilder();

  let installedAt = rubber.installedAt;
  if (input.installedAt !== undefined) {
    installedAt =
      state === "inventory" && input.installedAt === null ? undefined : requireDate(input.installedAt, state === "inventory" ? "首次贴拍日期" : "安装日期");
  }

  let quantity = rubber.quantity;
  if (input.quantity !== undefined) {
    const parsed = input.quantity === null ? 1 : requirePositiveInt(input.quantity, "数量", LIMITS.maxQuantity);
    quantity = parsed > 1 ? parsed : undefined;
  }
  if ((quantity ?? 1) > 1 && (state !== "inventory" || installedAt)) {
    throw new DomainError("只有全新未拆的囤货胶皮可以登记多张");
  }

  // A used inventory sheet's take-off date starts its slower storage aging.
  let stashedAt = rubber.stashedAt;
  if (input.stashedAt !== undefined) {
    if (state !== "inventory") throw new DomainError("只有囤货中的胶皮有拆下日期");
    stashedAt = input.stashedAt === null ? undefined : requireDate(input.stashedAt, "拆下日期");
  }
  // A brand-new sheet has no timeline.
  const history = installedAt ? rubber.history : undefined;
  if (!installedAt) stashedAt = undefined;
  if (stashedAt && installedAt && stashedAt < installedAt) throw new DomainError("拆下日期不能早于首次贴拍日期");
  const lastPeriodEnd = history?.at(-1)?.to;
  if (stashedAt && lastPeriodEnd && stashedAt < lastPeriodEnd) throw new DomainError("拆下日期不能早于上一段贴拍记录的结束日期");

  let removedAt = rubber.removedAt;
  if (input.removedAt !== undefined) {
    if (state === "inventory") throw new DomainError("囤货中的胶皮无需退役，可以直接删除");
    removedAt = input.removedAt === null ? undefined : requireDate(input.removedAt, "退役日期");
  }
  // A used sheet's mount date only matters while it is later than its installation date.
  const mountedAt = installedAt && rubber.mountedAt && rubber.mountedAt > installedAt ? rubber.mountedAt : undefined;
  const lifeStart = mountedAt ?? installedAt;
  if (lifeStart && removedAt && removedAt < lifeStart) {
    throw new DomainError(mountedAt ? "退役日期不能早于贴上这块球拍的日期" : "退役日期不能早于安装日期");
  }

  const next: Rubber = compact({
    ...rubber,
    name: input.name === undefined ? rubber.name : requireText(input.name, "胶皮型号"),
    label: patch(rubber.label, input.label, (value) => optionalText(value, "自定义名称", LIMITS.labelLength)),
    hardness: patch(rubber.hardness, input.hardness, (value) => optionalText(value, "硬度", LIMITS.hardnessLength)),
    thicknessMm: patch(rubber.thicknessMm, input.thicknessMm, (value) =>
      optionalPositiveNumber(value, "厚度", LIMITS.maxThicknessMm),
    ),
    weightGrams: patch(rubber.weightGrams, input.weightGrams, (value) =>
      optionalPositiveNumber(value, "胶皮重量", LIMITS.maxWeightGrams),
    ),
    boosted: input.boosted === undefined ? rubber.boosted : requireBoolean(input.boosted, "灌油状态"),
    customCalendarDays: patch(rubber.customCalendarDays, input.customCalendarDays, (value) =>
      optionalPositiveInt(value, "日历寿命天数", LIMITS.maxCalendarDays),
    ),
    customPlayMinutes: patch(rubber.customPlayMinutes, input.customPlayMinutes, (value) =>
      optionalPositiveInt(value, "打球时长上限", LIMITS.maxPlayMinutes),
    ),
    initialPlayMinutes: patch(rubber.initialPlayMinutes, input.initialPlayMinutes, (value) =>
      optionalMinutes(value, "此前已打时长", LIMITS.maxInitialPlayMinutes),
    ),
    boostCycleDays: patch(rubber.boostCycleDays, input.boostCycleDays, (value) =>
      optionalPositiveInt(value, "复灌周期", LIMITS.maxBoostCycleDays),
    ),
    storageAgingPercent: patch(rubber.storageAgingPercent, input.storageAgingPercent, parseStorageAgingPercent),
    notes: patch(rubber.notes, input.notes, (value) => optionalText(value, "备注")),
    quantity,
    installedAt,
    mountedAt,
    removedAt,
    history,
    stashedAt,
    updatedAt: ctx.now,
  });
  builder.put("rubbers", next);

  if (!rubber.removedAt && next.removedAt) {
    stageFreedSlots(snapshot, builder, rubber.id, ctx);
  } else if (rubber.removedAt && !next.removedAt) {
    const racket = snapshot.rackets.find((item) => item.id === next.racketId);
    if (!racket || !next.side) throw new DomainError("原球拍已不存在，无法恢复这张胶皮", 409);
    const occupant = getRacketRubberId(racket, next.side);
    if (occupant && occupant !== next.id) throw new DomainError("该位置已有在用胶皮，请先更换或退役", 409);
    builder.put("rackets", { ...withSlot(racket, next.side, next.id), updatedAt: ctx.now });
  }

  return { delta: builder.build() };
}

/**
 * 「放回囤货」: takes a mounted rubber off on `input.date` (default today), or brings a retired one
 * back, and keeps it in the inventory as a used sheet that will be mounted again. Its stint on the
 * racket goes into its timeline (sessions of that stint keep counting, also ones logged later) and
 * it ages at its storage speed from the take-off date; its installation date and boosting logs stay.
 * Needs: the rubber and rackets pointing at it.
 */
export function planStashRubber(snapshot: AppSnapshot, id: string, input: StashRubberInput | undefined, ctx: DomainContext): DomainResult {
  const rubber = findRubber(snapshot, id);
  const state = getRubberState(rubber);
  if (state === "inventory") throw new DomainError("这张胶皮已经在囤货里了", 409);

  let endDate = rubber.removedAt ?? ctx.today;
  if (state === "mounted") {
    endDate = optionalDate(input?.date, "撕下日期") ?? ctx.today;
    const mountedDate = getRubberMountedDate(rubber);
    if (mountedDate && endDate < mountedDate) throw new DomainError("撕下日期不能早于贴上这块球拍的日期");
  }

  const builder = new DeltaBuilder();
  stageStash(builder, rubber, endDate, ctx);
  stageFreedSlots(snapshot, builder, rubber.id, ctx);
  return { delta: builder.build() };
}

/** Deletes a rubber and its boosting logs, freeing any racket slot that points at it. */
export function planDeleteRubber(snapshot: AppSnapshot, id: string, ctx: DomainContext): DomainResult {
  const rubber = findRubber(snapshot, id);
  const builder = new DeltaBuilder();
  builder.remove("rubbers", rubber.id);
  logsOfRubber(snapshot, rubber.id).forEach((log) => builder.remove("boostingLogs", log.id));
  stageFreedSlots(snapshot, builder, rubber.id, ctx);
  return { delta: builder.build() };
}

/**
 * Mounts a rubber (new, or taken from the inventory) on one side of a racket. Whatever was mounted
 * there comes off on the same date: retired (default), freezing its life, play time and boosting
 * history, or with `outgoing: "stash"` kept in the inventory to be mounted again later.
 * Works for empty slots too. Needs: the racket, its rubbers, and the inventory rubber and its
 * boosting logs (if any).
 */
export function planReplaceRubber(snapshot: AppSnapshot, racketId: string, input: ReplaceRubberInput, ctx: DomainContext): CreateResult {
  const racket = findRacket(snapshot, racketId);
  const side = requireSide(input.side);
  const date = optionalDate(input.date, "更换日期") ?? ctx.today;
  const outgoingAction = parseOutgoingAction(input.outgoing);
  const builder = new DeltaBuilder();
  const currentId = getRacketRubberId(racket, side);

  const outgoing = snapshot.rubbers.filter(
    (rubber) => !rubber.removedAt && (rubber.id === currentId || (rubber.racketId === racket.id && rubber.side === side)),
  );
  for (const rubber of outgoing) {
    const mountedDate = getRubberMountedDate(rubber);
    if (mountedDate && date < mountedDate) throw new DomainError("更换日期不能早于旧胶皮的安装日期");
    const placed = { ...rubber, racketId: rubber.racketId ?? racket.id, side: rubber.side ?? side };
    if (outgoingAction === "stash") stageStash(builder, placed, date, ctx);
    else builder.put("rubbers", { ...placed, removedAt: date, updatedAt: ctx.now });
  }

  const rubberId = stageMount(snapshot, builder, { racketId: racket.id, side, date, trackMount: true }, input.source, ctx);
  builder.put("rackets", { ...withSlot(builder.current("rackets", racket), side, rubberId), updatedAt: ctx.now });
  return { delta: builder.build(), id: rubberId };
}

// ---------------------------------------------------------------------------
// Planners: play sessions
// ---------------------------------------------------------------------------

export function planCreatePlaySession(snapshot: AppSnapshot, input: CreatePlaySessionInput, ctx: DomainContext): CreateResult {
  const racket = findRacket(snapshot, input.racketId);
  const builder = new DeltaBuilder();
  const session: PlaySession = compact({
    id: ctx.createId("session"),
    racketId: racket.id,
    date: requireDate(input.date, "日期"),
    durationMinutes: requirePositiveInt(input.durationMinutes, "时长", LIMITS.maxSessionMinutes),
    notes: optionalText(input.notes, "备注"),
    createdAt: ctx.now,
  });
  builder.put("playSessions", session);
  return { delta: builder.build(), id: session.id };
}

/** Needs: the session and, when `racketId` changes, the target racket. */
export function planUpdatePlaySession(snapshot: AppSnapshot, id: string, input: UpdatePlaySessionInput): DomainResult {
  const session = findPlaySession(snapshot, id);
  const builder = new DeltaBuilder();
  builder.put(
    "playSessions",
    compact({
      ...session,
      racketId: input.racketId === undefined ? session.racketId : findRacket(snapshot, input.racketId).id,
      date: input.date === undefined ? session.date : requireDate(input.date, "日期"),
      durationMinutes:
        input.durationMinutes === undefined
          ? session.durationMinutes
          : requirePositiveInt(input.durationMinutes, "时长", LIMITS.maxSessionMinutes),
      notes: patch(session.notes, input.notes, (value) => optionalText(value, "备注")),
    }),
  );
  return { delta: builder.build() };
}

export function planDeletePlaySession(snapshot: AppSnapshot, id: string): DomainResult {
  const session = findPlaySession(snapshot, id);
  const builder = new DeltaBuilder();
  builder.remove("playSessions", session.id);
  return { delta: builder.build() };
}

// ---------------------------------------------------------------------------
// Planners: boosting logs (boostNumber is always recalculated chronologically)
// ---------------------------------------------------------------------------

/** Needs: the rubber and its logs. Marks the rubber as boosted. */
export function planCreateBoostingLog(snapshot: AppSnapshot, input: CreateBoostingLogInput, ctx: DomainContext): CreateResult {
  const rubber = findRubber(snapshot, input.rubberId);
  const builder = new DeltaBuilder();
  const log: BoostingLog = compact({
    id: ctx.createId("boost"),
    rubberId: rubber.id,
    date: requireDate(input.date, "灌油日期"),
    boostNumber: 0,
    layers: requirePositiveInt(input.layers, "层数", LIMITS.maxLayers),
    notes: optionalText(input.notes, "备注"),
    createdAt: ctx.now,
  });
  stageRenumberedLogs(builder, [...logsOfRubber(snapshot, rubber.id), log]);
  if (!rubber.boosted) builder.put("rubbers", { ...rubber, boosted: true, updatedAt: ctx.now });
  return { delta: builder.build(), id: log.id };
}

/** Needs: the log and its sibling logs (same rubber). */
export function planUpdateBoostingLog(snapshot: AppSnapshot, id: string, input: UpdateBoostingLogInput): DomainResult {
  const log = findBoostingLog(snapshot, id);
  const builder = new DeltaBuilder();
  const next: BoostingLog = compact({
    ...log,
    date: input.date === undefined ? log.date : requireDate(input.date, "灌油日期"),
    layers: input.layers === undefined ? log.layers : requirePositiveInt(input.layers, "层数", LIMITS.maxLayers),
    notes: patch(log.notes, input.notes, (value) => optionalText(value, "备注")),
  });
  builder.put("boostingLogs", next);
  stageRenumberedLogs(
    builder,
    logsOfRubber(snapshot, log.rubberId).map((item) => (item.id === next.id ? next : item)),
  );
  return { delta: builder.build() };
}

/**
 * Needs: the log and its siblings. The rubber stays a boosting rubber (`boosted` is the user's
 * 需要灌油 setting, switched off in the rubber editor), even when its last log is deleted.
 */
export function planDeleteBoostingLog(snapshot: AppSnapshot, id: string, _ctx?: DomainContext): DomainResult {
  const log = findBoostingLog(snapshot, id);
  const builder = new DeltaBuilder();
  builder.remove("boostingLogs", log.id);
  stageRenumberedLogs(
    builder,
    logsOfRubber(snapshot, log.rubberId).filter((item) => item.id !== log.id),
  );
  return { delta: builder.build() };
}
