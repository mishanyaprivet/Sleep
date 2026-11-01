/**
 * Timezone-aware date/time helpers built on the platform Intl API.
 *
 * Conventions:
 *  - Instants are stored as ISO-8601 UTC strings, so durations are always exact
 *    (DST transitions and timezone changes cannot corrupt a duration).
 *  - Each record remembers the IANA timezone it was logged in; clock times are
 *    rendered in that zone, so a night logged in Tokyo still reads "23:10".
 *  - A night is labelled by the local calendar date of the wake-up ("night of"
 *    = morning date), matching how most wearables label sleep.
 */

export const MIN_PER_DAY = 1440;

export function deviceTimeZone(): string {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';
  } catch {
    return 'UTC';
  }
}

const partsCache = new Map<string, Intl.DateTimeFormat>();
function partsFormatter(tz: string): Intl.DateTimeFormat {
  let f = partsCache.get(tz);
  if (!f) {
    try {
      f = new Intl.DateTimeFormat('en-US', {
        timeZone: tz,
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
        hourCycle: 'h23',
      });
    } catch {
      f = partsFormatter('UTC');
    }
    partsCache.set(tz, f);
  }
  return f;
}

export interface ZonedParts {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
  second: number;
}

export function zonedParts(instant: Date | string | number, tz: string): ZonedParts {
  const d = instant instanceof Date ? instant : new Date(instant);
  const out: Record<string, number> = {};
  for (const p of partsFormatter(tz).formatToParts(d)) {
    if (p.type !== 'literal') out[p.type] = Number(p.value);
  }
  return {
    year: out.year,
    month: out.month,
    day: out.day,
    hour: out.hour === 24 ? 0 : out.hour,
    minute: out.minute,
    second: out.second,
  };
}

const pad = (n: number) => String(n).padStart(2, '0');

/** YYYY-MM-DD of an instant in the given timezone. */
export function dateKeyInZone(instant: Date | string | number, tz: string): string {
  const p = zonedParts(instant, tz);
  return `${p.year}-${pad(p.month)}-${pad(p.day)}`;
}

/** Minutes since local midnight (0–1439) of an instant in a timezone. */
export function clockMinutesInZone(instant: Date | string | number, tz: string): number {
  const p = zonedParts(instant, tz);
  return p.hour * 60 + p.minute;
}

export function todayKey(tz = deviceTimeZone()): string {
  return dateKeyInZone(new Date(), tz);
}

export function parseDateKey(key: string): { y: number; m: number; d: number } {
  const [y, m, d] = key.split('-').map(Number);
  return { y, m, d };
}

/** Calendar arithmetic on YYYY-MM-DD keys (timezone-free, uses UTC internally). */
export function addDays(key: string, n: number): string {
  const { y, m, d } = parseDateKey(key);
  const t = new Date(Date.UTC(y, m - 1, d + n));
  return `${t.getUTCFullYear()}-${pad(t.getUTCMonth() + 1)}-${pad(t.getUTCDate())}`;
}

export function diffDays(a: string, b: string): number {
  const pa = parseDateKey(a);
  const pb = parseDateKey(b);
  return Math.round(
    (Date.UTC(pa.y, pa.m - 1, pa.d) - Date.UTC(pb.y, pb.m - 1, pb.d)) / 86_400_000,
  );
}

/** 0 = Sunday … 6 = Saturday. */
export function weekdayOf(key: string): number {
  const { y, m, d } = parseDateKey(key);
  return new Date(Date.UTC(y, m - 1, d)).getUTCDay();
}

export function parseHHmm(s: string): number {
  const [h, m] = s.split(':').map(Number);
  return ((h || 0) * 60 + (m || 0)) % MIN_PER_DAY;
}

export function toHHmm(min: number): string {
  const m = ((Math.round(min) % MIN_PER_DAY) + MIN_PER_DAY) % MIN_PER_DAY;
  return `${pad(Math.floor(m / 60))}:${pad(m % 60)}`;
}

/**
 * Build a Date from a local (device-timezone) calendar date and wall-clock time.
 * The JS engine resolves DST for the device zone.
 */
export function localDateTime(dateKey: string, hhmm: string): Date {
  const { y, m, d } = parseDateKey(dateKey);
  const min = parseHHmm(hhmm);
  return new Date(y, m - 1, d, Math.floor(min / 60), min % 60, 0, 0);
}

/**
 * Convert a wall-clock date/time in an arbitrary IANA zone to an instant.
 * Iterates on the zone offset so it is correct across DST changes. For
 * non-existent local times (spring-forward gap) it lands just after the gap.
 */
export function zonedDateTime(dateKey: string, hhmm: string, tz: string): Date {
  const { y, m, d } = parseDateKey(dateKey);
  const min = parseHHmm(hhmm);
  const wallAsUtc = Date.UTC(y, m - 1, d, Math.floor(min / 60), min % 60);
  let guess = wallAsUtc;
  for (let i = 0; i < 3; i++) {
    const p = zonedParts(guess, tz);
    const asUtc = Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute);
    const diff = asUtc - wallAsUtc;
    if (diff === 0) break;
    guess -= diff;
  }
  return new Date(guess);
}

/**
 * Resolve a night from a wake-up date plus bedtime and wake clock times.
 * If the bedtime clock is at/after the wake clock, the night crossed midnight
 * and bedtime falls on the previous calendar day.
 */
export function resolveNight(
  wakeDateKey: string,
  bedHHmm: string,
  wakeHHmm: string,
  tz: string = deviceTimeZone(),
): { bedtime: Date; wakeTime: Date } {
  const wakeTime = zonedDateTime(wakeDateKey, wakeHHmm, tz);
  const bedSameDay = zonedDateTime(wakeDateKey, bedHHmm, tz);
  const bedtime =
    bedSameDay.getTime() < wakeTime.getTime()
      ? bedSameDay
      : zonedDateTime(addDays(wakeDateKey, -1), bedHHmm, tz);
  return { bedtime, wakeTime };
}

export function minutesBetween(a: Date | string, b: Date | string): number {
  return (new Date(b).getTime() - new Date(a).getTime()) / 60_000;
}

/**
 * Map a clock time onto a continuous "night axis" so bedtimes around midnight
 * can be averaged: 12:00 → 720 … 23:59 → 1439, 00:00 → 1440 … 11:59 → 2159.
 */
export function toNightAxis(clockMin: number): number {
  return clockMin < 720 ? clockMin + MIN_PER_DAY : clockMin;
}

/** Wake-up axis: 18:00–23:59 are treated as the previous evening (negative). */
export function toMorningAxis(clockMin: number): number {
  return clockMin >= 1080 ? clockMin - MIN_PER_DAY : clockMin;
}

export function normalizeClock(min: number): number {
  return ((Math.round(min) % MIN_PER_DAY) + MIN_PER_DAY) % MIN_PER_DAY;
}

/** Signed shortest difference a − b between two clock times, in −720…720. */
export function clockDiff(a: number, b: number): number {
  let d = (a - b) % MIN_PER_DAY;
  if (d > 720) d -= MIN_PER_DAY;
  if (d < -720) d += MIN_PER_DAY;
  return d;
}

// ---------- formatting ----------

export function formatDuration(min: number | null | undefined, opts: { short?: boolean } = {}): string {
  if (min == null || !Number.isFinite(min)) return '—';
  const sign = min < 0 ? '−' : '';
  const total = Math.round(Math.abs(min));
  const h = Math.floor(total / 60);
  const m = total % 60;
  if (opts.short) {
    if (h === 0) return `${sign}${m}m`;
    return m === 0 ? `${sign}${h}h` : `${sign}${h}h ${m}m`;
  }
  if (h === 0) return `${sign}${m}m`;
  return `${sign}${h}h ${pad(m)}m`;
}

export function formatClock(clockMin: number, clock: '12h' | '24h' = '24h'): string {
  const m = normalizeClock(clockMin);
  const h = Math.floor(m / 60);
  const mm = pad(m % 60);
  if (clock === '24h') return `${pad(h)}:${mm}`;
  const h12 = h % 12 === 0 ? 12 : h % 12;
  return `${h12}:${mm} ${h < 12 ? 'AM' : 'PM'}`;
}

export function formatInstantClock(
  instant: string | Date,
  tz: string,
  clock: '12h' | '24h' = '24h',
): string {
  return formatClock(clockMinutesInZone(instant, tz), clock);
}

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const MONTHS_LONG = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];
export const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const WEEKDAYS_LONG = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

export function formatDateKey(key: string, style: 'short' | 'long' | 'weekday' | 'day' = 'short'): string {
  const { y, m, d } = parseDateKey(key);
  const wd = weekdayOf(key);
  switch (style) {
    case 'long':
      return `${WEEKDAYS_LONG[wd]}, ${MONTHS_LONG[m - 1]} ${d}`;
    case 'weekday':
      return WEEKDAYS[wd];
    case 'day':
      return `${d}`;
    default:
      return `${MONTHS[m - 1]} ${d}${y !== new Date().getFullYear() ? `, ${y}` : ''}`;
  }
}

export function monthLabel(y: number, m: number): string {
  return `${MONTHS_LONG[m - 1]} ${y}`;
}

export function relativeDayLabel(key: string, today = todayKey()): string {
  const diff = diffDays(today, key);
  if (diff === 0) return 'Today';
  if (diff === 1) return 'Yesterday';
  if (diff > 1 && diff < 7) return WEEKDAYS_LONG[weekdayOf(key)];
  return formatDateKey(key);
}

/** Value for <input type="datetime-local"> in the device timezone. */
export function toDateTimeLocalValue(d: Date): string {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export function signedMinutes(min: number): string {
  const r = Math.round(min);
  if (r === 0) return '±0m';
  return `${r > 0 ? '+' : '−'}${formatDuration(Math.abs(r), { short: true })}`;
}
