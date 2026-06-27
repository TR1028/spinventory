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

export function formatDate(value: string) {
  return new Intl.DateTimeFormat("zh-CN", {
    month: "short",
    day: "numeric",
  }).format(parseLocalDate(value));
}

export function isWithinLastDays(value: string, dayCount: number, asOf = todayISO()) {
  const age = daysBetween(value, asOf);
  return age >= 0 && age < dayCount;
}
