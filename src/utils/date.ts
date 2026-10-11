const MS_PER_DAY = 24 * 60 * 60 * 1000;

export function todayISO() {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

export function parseLocalDate(value: string) {
  const [year, month, day] = value.split("-").map(Number);
  return new Date(year, month - 1, day);
}

export function daysBetween(startISO: string, endISO = todayISO()) {
  const start = parseLocalDate(startISO).getTime();
  const end = parseLocalDate(endISO).getTime();
  return Math.max(0, Math.floor((end - start) / MS_PER_DAY));
}

/** Formats a `YYYY-MM-DD` value; returns the input unchanged when it is not a valid date. */
function formatCalendarDate(value: string, options: Intl.DateTimeFormatOptions) {
  const date = parseLocalDate(value);
  return Number.isNaN(date.getTime()) ? value : new Intl.DateTimeFormat("zh-CN", options).format(date);
}

export function formatDate(value: string) {
  return formatCalendarDate(value, {
    month: "short",
    day: "numeric",
  });
}

/** `YYYY-MM-DD` with the year, e.g. for archives that span several seasons. */
export function formatFullDate(value: string) {
  return formatCalendarDate(value, { year: "numeric", month: "short", day: "numeric" });
}

/** Formats an ISO timestamp (`createdAt`, sync times) in the device's time zone. */
export function formatTimestamp(value: string, { withTime = false } = {}) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat("zh-CN", {
    month: "short",
    day: "numeric",
    ...(withTime ? { hour: "2-digit", minute: "2-digit" } : {}),
  }).format(date);
}

/** Minutes as hours: whole hours stay whole (`90`), anything else keeps one decimal (`1.5`). */
export function formatHours(minutes: number) {
  const hours = minutes / 60;
  return Number.isInteger(hours) ? String(hours) : hours.toFixed(1);
}

export function isWithinLastDays(value: string, dayCount: number, asOf = todayISO()) {
  const age = daysBetween(value, asOf);
  return age >= 0 && age < dayCount;
}

/**
 * Minutes as an hours input value with up to two decimals (`95` -> `1.58`): precise enough that
 * saving the value again gives back the same minutes.
 */
export function hoursInputValue(minutes: number | undefined) {
  return minutes === undefined ? "" : String(Math.round((minutes / 60) * 100) / 100);
}

/** Parses an optional hours input into whole minutes (blank or 0 = unset); throws a Chinese message. */
export function parseHoursInput(value: string, label: string): number | undefined {
  const text = value.trim();
  if (!text) return undefined;
  const hours = Number(text);
  if (!Number.isFinite(hours) || hours < 0) throw new Error(`${label}需为不小于 0 的数字`);
  const minutes = Math.round(hours * 60);
  return minutes > 0 ? minutes : undefined;
}
