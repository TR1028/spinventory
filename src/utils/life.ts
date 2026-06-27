import type { BoostingLog, PlaySession, Rubber } from "../db/schema";
import { daysBetween, todayISO } from "./date";

export const FIXED_LIFE_PARAMETERS = {
  calendarDays: 120,
  playMinutes: 90 * 60,
};

export type RubberLife = {
  calendarDays: number;
  playMinutes: number;
  usedPercent: number;
  calendarPercent: number;
  playPercent: number;
  remainingCalendarDays: number;
  status: "good" | "watch" | "replace";
};

function clampPercent(value: number) {
  return Math.min(100, Math.max(0, value));
}

export function calculateRubberLife(rubber: Rubber, sessions: PlaySession[], asOf = todayISO()): RubberLife {
  const relevantSessions = sessions.filter((session) => {
    const afterInstall = session.date >= rubber.installedAt;
    const beforeRemoval = !rubber.removedAt || session.date <= rubber.removedAt;
    return afterInstall && beforeRemoval;
  });

  const playMinutes = relevantSessions.reduce((total, session) => total + session.durationMinutes, 0);
  const calendarDays = daysBetween(rubber.installedAt, asOf);
  const calendarPercent = clampPercent((calendarDays / FIXED_LIFE_PARAMETERS.calendarDays) * 100);
  const playPercent = clampPercent((playMinutes / FIXED_LIFE_PARAMETERS.playMinutes) * 100);
  const usedPercent = Math.max(calendarPercent, playPercent);

  return {
    calendarDays,
    playMinutes,
    usedPercent,
    calendarPercent,
    playPercent,
    remainingCalendarDays: Math.max(0, FIXED_LIFE_PARAMETERS.calendarDays - calendarDays),
    status: usedPercent >= 100 ? "replace" : usedPercent >= 80 ? "watch" : "good",
  };
}

export function getBoostingSummary(rubber: Rubber, logs: BoostingLog[], asOf = todayISO()) {
  const rubberLogs = logs
    .filter((log) => log.rubberId === rubber.id)
    .sort((left, right) => right.date.localeCompare(left.date));

  const lastLog = rubberLogs[0];

  return {
    count: rubberLogs.length,
    lastDate: lastLog?.date,
    daysSinceLastBoost: lastLog ? daysBetween(lastLog.date, asOf) : undefined,
  };
}
