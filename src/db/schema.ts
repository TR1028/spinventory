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

/** Lifecycle of a rubber, derived from its fields (see {@link getRubberState}). */
export type RubberState = "inventory" | "mounted" | "retired";

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
  createdAt: string;
  updatedAt?: string;
};

export type Rubber = {
  id: string;
  /** Empty while the rubber sits in the inventory; kept after retirement for the racket's history. */
  racketId?: string;
  /** Empty while the rubber sits in the inventory. */
  side?: RubberSide;
  name: string;
  hardness?: string;
  thicknessMm?: number;
  /** `YYYY-MM-DD` the rubber was glued onto a racket; calendar life starts here. */
  installedAt?: string;
  /** `YYYY-MM-DD` the rubber was taken off (retired); its life stops accumulating. */
  removedAt?: string;
  boosted: boolean;
  /** Calendar-life limit in days (default 120). */
  customCalendarDays?: number;
  /** Play-time limit in minutes (default 5400 = 90 h). */
  customPlayMinutes?: number;
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

export function getRacketStatus(racket: Pick<Racket, "status">): RacketStatus {
  return racket.status ?? "active";
}

export function getRubberState(rubber: Pick<Rubber, "racketId" | "removedAt">): RubberState {
  if (rubber.removedAt) return "retired";
  return rubber.racketId ? "mounted" : "inventory";
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
