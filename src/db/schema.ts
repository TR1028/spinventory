/**
 * Domain model shared by the PWA (Dexie / IndexedDB) and the Cloudflare Worker API (D1).
 *
 * Keep this module free of runtime dependencies (no Dexie, DOM or Workers APIs): it is compiled
 * into both `src/` and `worker/`.
 */

export type RubberSide = "forehand" | "backhand";

/**
 * - `active`: in use and shown on the dashboard (the default for records created before v2).
 * - `inventory`: spare / idle blade kept in the inventory.
 * - `retired`: archived.
 */
export type RacketStatus = "active" | "inventory" | "retired";

/**
 * Lifecycle of a rubber, derived from its fields (see {@link getRubberState}). `inventory` covers
 * brand-new sheets and used ones taken off a racket to be mounted again later (`installedAt` set).
 */
export type RubberState = "inventory" | "mounted" | "retired";

/**
 * Topsheet colours allowed by the ITTF: one side of a racket black, the other a bright colour
 * (red, blue, green, pink or violet).
 */
export type RubberColor = "black" | "red" | "blue" | "green" | "pink" | "purple";

/** Named sponge sizes sold without a mm figure: the maker's thickest (`MAX`) or no sponge (`OX`). */
export type ThicknessCode = "MAX" | "OX";

/** Handle shape: shakehand flared / straight / anatomic, Chinese penhold, Japanese penhold. */
export type GripType = "FL" | "ST" | "AN" | "CS" | "JP";

export type Racket = {
  id: string;
  name: string;
  blade: string;
  status?: RacketStatus;
  /** Currently mounted rubbers. Empty for a bare blade or an empty slot. */
  forehandRubberId?: string;
  backhandRubberId?: string;
  sortOrder?: number;
  notes?: string;
  /** Handle shape (v3). */
  gripType?: GripType;
  /** Bare blade weight in grams (v3). */
  bladeWeightGrams?: number;
  /** Assembled racket weight (blade + rubbers) in grams (v3). */
  totalWeightGrams?: number;
  /** `YYYY-MM-DD` the blade was first put into service (v3). */
  startedAt?: string;
  /** Play time on the blade before it was recorded in the app, in minutes (v3). */
  initialPlayMinutes?: number;
  createdAt: string;
  updatedAt?: string;
};

/**
 * A completed period of a rubber's timeline (v4): a stint on a racket that ended with the rubber
 * going back to the inventory, or a stretch stored in the inventory. Dates are inclusive `YYYY-MM-DD`.
 */
export type RubberPeriod =
  | { kind: "mounted"; racketId: string; side: RubberSide; from: string; to: string }
  | { kind: "stored"; from: string; to: string };

export type Rubber = {
  id: string;
  /** Empty while the rubber sits in the inventory; kept after retirement for the racket's history. */
  racketId?: string;
  /** Empty while the rubber sits in the inventory. */
  side?: RubberSide;
  /** Model, e.g. `红双喜 狂飚3 省狂蓝海绵 (H3 Provincial Blue)`. */
  name: string;
  /** Optional custom name that tells sheets of the same model apart, e.g. `1号` / `比赛备用` (v4). */
  label?: string;
  /**
   * Inventory only: identical brand-new sheets this record stands for (v4); absent means 1.
   * Mounting one of them splits it off as a record of its own.
   */
  quantity?: number;
  hardness?: string;
  /** Sponge thickness in mm (empty when `thicknessCode` names the size instead). */
  thicknessMm?: number;
  /** Named sponge size without a mm figure (v5): `MAX` (the maker's thickest) or `OX` (no sponge). */
  thicknessCode?: ThicknessCode;
  /** Topsheet colour (v5). */
  color?: RubberColor;
  /** Sheet weight in grams (v3). */
  weightGrams?: number;
  /**
   * `YYYY-MM-DD` the rubber was first glued onto a racket; calendar life starts here. Also set on a
   * used sheet back in the inventory (it keeps aging there, more slowly); empty for a brand-new sheet.
   */
  installedAt?: string;
  /**
   * `YYYY-MM-DD` the rubber went onto its current racket, set only when that is later than
   * `installedAt` (a used sheet, v3). Play sessions of the racket count from this date.
   */
  mountedAt?: string;
  /** `YYYY-MM-DD` the rubber was taken off (retired); its life stops accumulating. */
  removedAt?: string;
  /**
   * Completed periods before the current one, oldest first (v4): stints on rackets the rubber was
   * taken off to the inventory (sessions of those stints keep counting toward its play time) and
   * stretches it spent stored in the inventory (they age it at `storageAgingPercent`).
   */
  history?: RubberPeriod[];
  /** Inventory only: `YYYY-MM-DD` a used sheet was taken off and stored (v4); slower aging runs from here. */
  stashedAt?: string;
  /** Calendar aging speed while a used sheet is stored in the inventory, in percent (default 50) (v4). */
  storageAgingPercent?: number;
  /**
   * A boosting rubber (灌油胶皮): shows its boosting logs and re-boost reminders. Set by the user or
   * by logging a boost; most rubbers are never boosted.
   */
  boosted: boolean;
  /** Calendar-life limit in days (default 120). */
  customCalendarDays?: number;
  /** Play-time limit in minutes (default 5400 = 90 h). */
  customPlayMinutes?: number;
  /**
   * Play time not covered by recorded sessions, in minutes; counts toward its play life: play before
   * the rubber was recorded in the app (v3), and play on rackets that were deleted since.
   */
  initialPlayMinutes?: number;
  /** Re-boost reminder cycle in days (default 21). */
  boostCycleDays?: number;
  /** Free-form notes (batch, shop, weight, ...). */
  notes?: string;
  createdAt: string;
  updatedAt?: string;
};

export type BoostingLog = {
  id: string;
  rubberId: string;
  date: string;
  /** 1-based position in the rubber's boosting history, in chronological order. */
  boostNumber: number;
  layers: number;
  notes?: string;
  createdAt: string;
};

export type PlaySession = {
  id: string;
  racketId: string;
  date: string;
  durationMinutes: number;
  notes?: string;
  createdAt: string;
};

export type MetaRecord = {
  key: string;
  value: string;
};

export const RUBBER_SIDES: readonly RubberSide[] = ["forehand", "backhand"];
export const RACKET_STATUSES: readonly RacketStatus[] = ["active", "inventory", "retired"];

export const rubberSideLabel: Record<RubberSide, string> = {
  forehand: "FH",
  backhand: "BH",
};

export const rubberSideName: Record<RubberSide, string> = {
  forehand: "正手",
  backhand: "反手",
};

export const racketStatusLabel: Record<RacketStatus, string> = {
  active: "在用",
  inventory: "闲置",
  retired: "退役",
};

export const GRIP_TYPES: readonly GripType[] = ["FL", "ST", "AN", "CS", "JP"];

export const gripTypeLabel: Record<GripType, string> = {
  FL: "横板 FL",
  ST: "横板 ST",
  AN: "横板 AN",
  CS: "直板 CS",
  JP: "日直 JP",
};

export function isGripType(value: unknown): value is GripType {
  return GRIP_TYPES.includes(value as GripType);
}

export const RUBBER_COLORS: readonly RubberColor[] = ["black", "red", "blue", "green", "pink", "purple"];

export const rubberColorName: Record<RubberColor, string> = {
  black: "黑",
  red: "红",
  blue: "蓝",
  green: "绿",
  pink: "粉",
  purple: "紫",
};

/** Swatch colours for the UI. */
export const rubberColorSwatch: Record<RubberColor, string> = {
  black: "#1f2328",
  red: "#d7263d",
  blue: "#1f6feb",
  green: "#2da44e",
  pink: "#f472b6",
  purple: "#8250df",
};

export function isRubberColor(value: unknown): value is RubberColor {
  return RUBBER_COLORS.includes(value as RubberColor);
}

export const THICKNESS_CODES: readonly ThicknessCode[] = ["MAX", "OX"];

export function isThicknessCode(value: unknown): value is ThicknessCode {
  return THICKNESS_CODES.includes(value as ThicknessCode);
}

/** `2.1 mm`, `MAX`, `OX` — or `undefined` when no thickness was recorded. */
export function formatRubberThickness(rubber: Pick<Rubber, "thicknessMm" | "thicknessCode">) {
  if (rubber.thicknessCode) return rubber.thicknessCode;
  return rubber.thicknessMm ? `${rubber.thicknessMm} mm` : undefined;
}

/**
 * ITTF colour rule for the two sides of one racket: one black, the other a bright colour. Returns
 * a problem description, or `undefined` when the colours are fine or not both recorded.
 */
export function checkRacketColors(forehand?: RubberColor, backhand?: RubberColor) {
  if (!forehand || !backhand) return undefined;
  const blackSides = [forehand, backhand].filter((color) => color === "black").length;
  if (blackSides === 2) return "两面都是黑色";
  if (blackSides === 0) return "两面都不是黑色";
  return undefined;
}

export function getRacketStatus(racket: Pick<Racket, "status">): RacketStatus {
  return racket.status ?? "active";
}

export function getRubberState(rubber: Pick<Rubber, "racketId" | "removedAt">): RubberState {
  if (rubber.removedAt) return "retired";
  return rubber.racketId ? "mounted" : "inventory";
}

/** Sheets a record stands for: its `quantity` (inventory stock), otherwise 1. */
export function getRubberQuantity(rubber: Pick<Rubber, "quantity">) {
  const { quantity } = rubber;
  return typeof quantity === "number" && Number.isFinite(quantity) && quantity > 1 ? Math.floor(quantity) : 1;
}

/** A sheet that has been glued on before (`installedAt` set), as opposed to a brand-new one. */
export function isUsedRubber(rubber: Pick<Rubber, "installedAt">) {
  return Boolean(rubber.installedAt);
}

/** Model plus the custom name, for plain-text mentions: `狂飚3 省狂 · 比赛备用`. */
export function getRubberDisplayName(rubber: Pick<Rubber, "name" | "label">) {
  return rubber.label ? `${rubber.name} · ${rubber.label}` : rubber.name;
}

/** First day the rubber has been on its current racket: `mountedAt` when later than `installedAt`. */
export function getRubberMountedDate(rubber: Pick<Rubber, "installedAt" | "mountedAt">) {
  const { installedAt, mountedAt } = rubber;
  if (!installedAt) return mountedAt;
  return mountedAt && mountedAt > installedAt ? mountedAt : installedAt;
}

/** A racket stretch whose sessions count toward a rubber's play time (`to` empty: still on it). */
export type RubberStint = { racketId: string; from: string; to?: string };

/** The rubber's stints on rackets: completed ones from its `history`, then the current mount (if any). */
export function getRubberStints(
  rubber: Pick<Rubber, "history" | "racketId" | "installedAt" | "mountedAt" | "removedAt">,
): RubberStint[] {
  const stints: RubberStint[] = (rubber.history ?? []).flatMap((period) =>
    period.kind === "mounted" ? [{ racketId: period.racketId, from: period.from, to: period.to }] : [],
  );
  const from = getRubberMountedDate(rubber);
  if (rubber.racketId && from) stints.push({ racketId: rubber.racketId, from, to: rubber.removedAt });
  return stints;
}

export function getRacketRubberId(racket: Pick<Racket, "forehandRubberId" | "backhandRubberId">, side: RubberSide) {
  return side === "forehand" ? racket.forehandRubberId : racket.backhandRubberId;
}

// ---------------------------------------------------------------------------
// Snapshot & sync contract
// ---------------------------------------------------------------------------

export type EntityKey = "rackets" | "rubbers" | "boostingLogs" | "playSessions";

export const ENTITY_KEYS: readonly EntityKey[] = ["rackets", "rubbers", "boostingLogs", "playSessions"];

export type AppSnapshot = {
  rackets: Racket[];
  rubbers: Rubber[];
  boostingLogs: BoostingLog[];
  playSessions: PlaySession[];
};

/** Records written (`upserts`) and ids removed (`deletes`) by one mutation. */
export type AppDataDelta = {
  upserts: AppSnapshot;
  deletes: Record<EntityKey, string[]>;
};

// ---------------------------------------------------------------------------
// Cloud API contract (worker/ <-> src/db/cloudApi.ts)
// ---------------------------------------------------------------------------

export type OAuthProvider = "github" | "google";

export type UserProfile = {
  id: string;
  username: string;
  email?: string;
  createdAt: string;
};

export type RegisterRequest = { username: string; email?: string; password: string };
/** `identifier` is a username or an email address. */
export type LoginRequest = { identifier: string; password: string };
export type AuthResponse = { token: string; user: UserProfile };
export type AuthConfigResponse = { registrationOpen: boolean; oauthProviders: OAuthProvider[] };
export type MeResponse = { user: UserProfile; oauthProviders: OAuthProvider[] };
export type ApiErrorBody = { error: string };

/** Response of every mutating endpoint; `id` is the primary record created by the call. */
export type MutationResponse = { delta: AppDataDelta; id?: string };

export type SyncImportRequest = Partial<AppSnapshot>;

export type SyncImportResponse = {
  /** Records received per table. */
  received: Record<EntityKey, number>;
  /** Rows inserted or updated in D1 (cloud rows edited more recently are kept). */
  imported: Record<EntityKey, number>;
  /** Malformed records that were skipped. */
  invalid: Record<EntityKey, number>;
};
