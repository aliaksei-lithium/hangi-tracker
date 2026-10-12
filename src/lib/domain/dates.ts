// Calendar-date helpers on 'YYYY-MM-DD' strings. Arithmetic runs in UTC so that
// daylight-saving changes never shift a date by one day.

export function toIsoDate(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function parse(date: string): Date {
  const [y, m, d] = date.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d));
}

export function addDays(date: string, days: number): string {
  const d = parse(date);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

/** 0 = Sunday ... 6 = Saturday. */
export function weekday(date: string): number {
  return parse(date).getUTCDay();
}

/** Whole days from `a` to `b` (b - a). */
export function daysBetween(a: string, b: string): number {
  return Math.round((parse(b).getTime() - parse(a).getTime()) / 86_400_000);
}

const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/** "Thu 15 Oct" */
export function formatShortDate(date: string): string {
  const d = parse(date);
  return `${WEEKDAYS[d.getUTCDay()]} ${d.getUTCDate()} ${MONTHS[d.getUTCMonth()]}`;
}

export const WEEKDAY_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
