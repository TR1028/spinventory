import {
  getRubberMountedDate,
  getRubberState,
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
} as const;

/** @deprecated Limits are per rubber now; use {@link getRubberLifeLimits} or {@link DEFAULT_LIFE_PARAMETERS}. */
export const FIXED_LIFE_PARAMETERS = {
  calendarDays: DEFAULT_LIFE_PARAMETERS.calendarDays,
  playMinutes: DEFAULT_LIFE_PARAMETERS.playMinutes,
};

export type RubberLife = {
  calendarDays: number;
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
   * `inventory` rubbers: brand-new ones have not started aging, used ones keep aging from their first
   * installation; `retired` rubbers are frozen at `removedAt`.
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

/** Last day that counts toward a rubber's age: `asOf`, frozen at `removedAt` once retired. */
export function getRubberLifeEndDate(rubber: Pick<Rubber, "removedAt">, asOf = todayISO()) {
  return rubber.removedAt && rubber.removedAt < asOf ? rubber.removedAt : asOf;
}

function lifeStatus(usedPercent: number): RubberLife["status"] {
  return usedPercent >= 100 ? "replace" : usedPercent >= 80 ? "watch" : "good";
}

export function calculateRubberLife(rubber: Rubber, sessions: PlaySession[], asOf = todayISO()): RubberLife {
  const limits = getRubberLifeLimits(rubber);
  const state = getRubberState(rubber);
  const installedAt = rubber.installedAt;
  /** Play time not covered by the current racket's sessions (before recording, earlier rackets). */
  const initialPlayMinutes = Math.round(positiveOr(rubber.initialPlayMinutes, 0));
  const used = Boolean(installedAt) || initialPlayMinutes > 0;

  if (!installedAt) {
    // Brand-new sheet in the inventory: the calendar has not started; only pre-recorded play time counts.
    const playPercent = clampPercent((initialPlayMinutes / limits.playMinutes) * 100);
    return {
      calendarDays: 0,
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

  // Sessions count from the day the rubber went onto its current racket (`mountedAt` for a used
  // sheet moved onto it); its earlier play is already in `initialPlayMinutes`. A used sheet waiting
  // in the inventory is on no racket, so only that frozen play time counts while it keeps aging.
  const sessionsFrom = getRubberMountedDate(rubber) ?? installedAt;
  const relevantSessions = rubber.racketId
    ? sessions.filter((session) => {
        const sameRacket = session.racketId === rubber.racketId;
        const afterInstall = session.date >= sessionsFrom;
        const beforeRemoval = !rubber.removedAt || session.date <= rubber.removedAt;
        return sameRacket && afterInstall && beforeRemoval;
      })
    : [];

  const playMinutes = relevantSessions.reduce((total, session) => total + session.durationMinutes, initialPlayMinutes);
  const calendarDays = daysBetween(installedAt, getRubberLifeEndDate(rubber, asOf));
  const calendarPercent = clampPercent((calendarDays / limits.calendarDays) * 100);
  const playPercent = clampPercent((playMinutes / limits.playMinutes) * 100);
  const usedPercent = Math.max(calendarPercent, playPercent);

  return {
    calendarDays,
    playMinutes,
    usedPercent,
    calendarPercent,
    playPercent,
    remainingCalendarDays: Math.max(0, limits.calendarDays - calendarDays),
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
