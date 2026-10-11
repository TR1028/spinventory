import {
  getRubberState,
  getRubberStints,
  type BoostingLog,
  type PlaySession,
  type Rubber,
  type RubberState,
} from "../db/schema";
import { daysBetween, todayISO } from "./date";

export const DEFAULT_LIFE_PARAMETERS = {
  calendarDays: 120,
  playMinutes: 90 * 60,
  boostCycleDays: 21,
  /** A used sheet stored in the inventory ages at half speed: it is no longer played. */
  storageAgingPercent: 50,
} as const;

/** @deprecated Limits are per rubber now; use {@link getRubberLifeLimits} or {@link DEFAULT_LIFE_PARAMETERS}. */
export const FIXED_LIFE_PARAMETERS = {
  calendarDays: DEFAULT_LIFE_PARAMETERS.calendarDays,
  playMinutes: DEFAULT_LIFE_PARAMETERS.playMinutes,
};

export type RubberLife = {
  /** Calendar aging in days (rounded): days on rackets, plus days stored at the storage speed. */
  calendarDays: number;
  /** Real days since the first installation (up to retirement). */
  elapsedDays: number;
  /** Days of `elapsedDays` the sheet spent stored in the inventory. */
  storedDays: number;
  /** Aging speed applied to `storedDays`, in percent. */
  storageAgingPercent: number;
  playMinutes: number;
  usedPercent: number;
  calendarPercent: number;
  playPercent: number;
  remainingCalendarDays: number;
  remainingPlayMinutes: number;
  /** Effective limits: the rubber's custom values or the defaults. */
  calendarLimitDays: number;
  playLimitMinutes: number;
  /**
   * `inventory` rubbers: brand-new ones have not started aging, used ones keep aging (more slowly)
   * from their first installation; `retired` rubbers are frozen at `removedAt`.
   */
  state: RubberState;
  /** Glued on before (or has recorded play time), as opposed to a brand-new sheet. */
  used: boolean;
  status: "good" | "watch" | "replace";
};

export type BoostingSummary = {
  count: number;
  lastDate?: string;
  daysSinceLastBoost?: number;
  /** Re-boost reminder cycle in days (custom or default 21). */
  cycleDays: number;
  /** A boosting rubber on a racket whose last boost is at least `cycleDays` old. */
  needsReboost: boolean;
  /** Days until the reminder is due (negative when overdue). */
  daysUntilReboost?: number;
};

function clampPercent(value: number) {
  return Math.min(100, Math.max(0, value));
}

function positiveOr(value: number | undefined, fallback: number) {
  return typeof value === "number" && Number.isFinite(value) && value > 0 ? value : fallback;
}

export function getRubberLifeLimits(rubber: Pick<Rubber, "customCalendarDays" | "customPlayMinutes">) {
  return {
    calendarDays: positiveOr(rubber.customCalendarDays, DEFAULT_LIFE_PARAMETERS.calendarDays),
    playMinutes: positiveOr(rubber.customPlayMinutes, DEFAULT_LIFE_PARAMETERS.playMinutes),
  };
}

export function getRubberBoostCycleDays(rubber: Pick<Rubber, "boostCycleDays">) {
  return positiveOr(rubber.boostCycleDays, DEFAULT_LIFE_PARAMETERS.boostCycleDays);
}

/** Calendar aging speed while stored in the inventory, in percent (custom 1–100 or the default 50). */
export function getStorageAgingPercent(rubber: Pick<Rubber, "storageAgingPercent">) {
  return Math.min(100, positiveOr(rubber.storageAgingPercent, DEFAULT_LIFE_PARAMETERS.storageAgingPercent));
}

/** Last day that counts toward a rubber's age: `asOf`, frozen at `removedAt` once retired. */
export function getRubberLifeEndDate(rubber: Pick<Rubber, "removedAt">, asOf = todayISO()) {
  return rubber.removedAt && rubber.removedAt < asOf ? rubber.removedAt : asOf;
}

/**
 * Sessions played with a rubber: those of each racket stint (past stints from its timeline and the
 * current mount), whenever they were logged. A session counts once even if stints touch.
 */
export function getRubberSessions(rubber: Rubber, sessions: readonly PlaySession[]) {
  const stints = getRubberStints(rubber);
  if (!stints.length) return [];
  return sessions.filter((session) =>
    stints.some((stint) => session.racketId === stint.racketId && session.date >= stint.from && (!stint.to || session.date <= stint.to)),
  );
}

/** Days a used sheet spent stored in the inventory up to `endDate`: past stretches plus the current one. */
export function getRubberStoredDays(rubber: Pick<Rubber, "history" | "stashedAt" | "racketId" | "removedAt">, endDate: string) {
  let days = 0;
  for (const period of rubber.history ?? []) {
    if (period.kind === "stored" && period.from < endDate) days += daysBetween(period.from, period.to < endDate ? period.to : endDate);
  }
  if (getRubberState(rubber) === "inventory" && rubber.stashedAt) days += daysBetween(rubber.stashedAt, endDate);
  return days;
}

function lifeStatus(usedPercent: number): RubberLife["status"] {
  return usedPercent >= 100 ? "replace" : usedPercent >= 80 ? "watch" : "good";
}

/**
 * Life of a rubber. `sessions` should be all play sessions (any racket): a rubber moved between
 * rackets collects the sessions of each of its stints.
 */
export function calculateRubberLife(rubber: Rubber, sessions: readonly PlaySession[], asOf = todayISO()): RubberLife {
  const limits = getRubberLifeLimits(rubber);
  const state = getRubberState(rubber);
  const installedAt = rubber.installedAt;
  const storageAgingPercent = getStorageAgingPercent(rubber);
  /** Play time not covered by recorded sessions (before recording, deleted rackets). */
  const initialPlayMinutes = Math.round(positiveOr(rubber.initialPlayMinutes, 0));
  const used = Boolean(installedAt) || initialPlayMinutes > 0;

  if (!installedAt) {
    // Brand-new sheet in the inventory: the calendar has not started; only pre-recorded play time counts.
    const playPercent = clampPercent((initialPlayMinutes / limits.playMinutes) * 100);
    return {
      calendarDays: 0,
      elapsedDays: 0,
      storedDays: 0,
      storageAgingPercent,
      playMinutes: initialPlayMinutes,
      usedPercent: playPercent,
      calendarPercent: 0,
      playPercent,
      remainingCalendarDays: limits.calendarDays,
      remainingPlayMinutes: Math.max(0, limits.playMinutes - initialPlayMinutes),
      calendarLimitDays: limits.calendarDays,
      playLimitMinutes: limits.playMinutes,
      state,
      used,
      status: lifeStatus(playPercent),
    };
  }

  // Play time belongs to the rubber: the sessions of every racket stint it had, plus play from
  // before it was recorded. A sheet waiting in the inventory is on no racket and collects none.
  const playMinutes = getRubberSessions(rubber, sessions).reduce((total, session) => total + session.durationMinutes, initialPlayMinutes);

  // Calendar aging keeps running in the inventory, but slower: stored days count at the storage speed.
  const endDate = getRubberLifeEndDate(rubber, asOf);
  const elapsedDays = daysBetween(installedAt, endDate);
  const storedDays = Math.min(elapsedDays, getRubberStoredDays(rubber, endDate));
  const agingDays = Math.max(0, elapsedDays - storedDays * (1 - storageAgingPercent / 100));
  const calendarPercent = clampPercent((agingDays / limits.calendarDays) * 100);
  const playPercent = clampPercent((playMinutes / limits.playMinutes) * 100);
  const usedPercent = Math.max(calendarPercent, playPercent);

  return {
    calendarDays: Math.round(agingDays),
    elapsedDays,
    storedDays,
    storageAgingPercent,
    playMinutes,
    usedPercent,
    calendarPercent,
    playPercent,
    remainingCalendarDays: Math.max(0, Math.round(limits.calendarDays - agingDays)),
    remainingPlayMinutes: Math.max(0, limits.playMinutes - playMinutes),
    calendarLimitDays: limits.calendarDays,
    playLimitMinutes: limits.playMinutes,
    state,
    used,
    status: lifeStatus(usedPercent),
  };
}

export function getBoostingSummary(rubber: Rubber, logs: BoostingLog[], asOf = todayISO()): BoostingSummary {
  const cycleDays = getRubberBoostCycleDays(rubber);
  const rubberLogs = logs
    .filter((log) => log.rubberId === rubber.id)
    .sort((left, right) => right.date.localeCompare(left.date) || right.boostNumber - left.boostNumber);

  const lastLog = rubberLogs[0];
  const daysSinceLastBoost = lastLog ? daysBetween(lastLog.date, getRubberLifeEndDate(rubber, asOf)) : undefined;

  return {
    count: rubberLogs.length,
    lastDate: lastLog?.date,
    daysSinceLastBoost,
    cycleDays,
    needsReboost: Boolean(
      rubber.boosted && getRubberState(rubber) === "mounted" && daysSinceLastBoost !== undefined && daysSinceLastBoost >= cycleDays,
    ),
    daysUntilReboost: daysSinceLastBoost === undefined ? undefined : cycleDays - daysSinceLastBoost,
  };
}
