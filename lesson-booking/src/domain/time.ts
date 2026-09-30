/**
 * タイムゾーン付き時刻ヘルパ。外部ライブラリなしで Intl を使う。
 */

const DAY_MS = 24 * 60 * 60 * 1000;
export const MINUTE_MS = 60 * 1000;

export function addDays(date: Date, days: number): Date {
  return new Date(date.getTime() + days * DAY_MS);
}

export function addMinutes(date: Date, minutes: number): Date {
  return new Date(date.getTime() + minutes * MINUTE_MS);
}

export function diffDays(later: Date, earlier: Date): number {
  return (later.getTime() - earlier.getTime()) / DAY_MS;
}

interface LocalParts {
  year: number;
  month: number; // 1-12
  day: number; // 1-31
  hour: number;
  minute: number;
  second: number;
  weekday: number; // 0=Sun
}

const WEEKDAYS: Record<string, number> = {
  Sun: 0,
  Mon: 1,
  Tue: 2,
  Wed: 3,
  Thu: 4,
  Fri: 5,
  Sat: 6,
};

const formatterCache = new Map<string, Intl.DateTimeFormat>();

function formatter(timeZone: string): Intl.DateTimeFormat {
  let f = formatterCache.get(timeZone);
  if (!f) {
    f = new Intl.DateTimeFormat('en-US', {
      timeZone,
      hourCycle: 'h23',
      weekday: 'short',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    });
    formatterCache.set(timeZone, f);
  }
  return f;
}

/** UTC 時刻を指定タイムゾーンのローカル各部に分解する */
export function toLocalParts(date: Date, timeZone: string): LocalParts {
  const parts = formatter(timeZone).formatToParts(date);
  const get = (type: Intl.DateTimeFormatPartTypes): string =>
    parts.find((p) => p.type === type)?.value ?? '';
  return {
    year: Number(get('year')),
    month: Number(get('month')),
    day: Number(get('day')),
    hour: Number(get('hour')),
    minute: Number(get('minute')),
    second: Number(get('second')),
    weekday: WEEKDAYS[get('weekday')] ?? 0,
  };
}

/** 指定タイムゾーンにおける UTC からのオフセット(分) */
export function offsetMinutes(date: Date, timeZone: string): number {
  const p = toLocalParts(date, timeZone);
  const asUtc = Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, p.second);
  return Math.round((asUtc - date.getTime()) / MINUTE_MS);
}

/**
 * ローカル日付 (YYYY-MM-DD) と時刻 (HH:MM) を、指定タイムゾーンの瞬間(UTC Date)に変換する。
 * DST 境界も概ね正しく扱えるよう 2 段階でオフセットを求める。
 */
export function zonedToUtc(localDate: string, localTime: string, timeZone: string): Date {
  const [y, m, d] = localDate.split('-').map(Number) as [number, number, number];
  const [hh, mm] = localTime.split(':').map(Number) as [number, number];
  const naive = Date.UTC(y, m - 1, d, hh, mm, 0);
  const guess = new Date(naive - offsetMinutes(new Date(naive), timeZone) * MINUTE_MS);
  const corrected = new Date(naive - offsetMinutes(guess, timeZone) * MINUTE_MS);
  return corrected;
}

/** 指定タイムゾーンでのローカル日付文字列 (YYYY-MM-DD) */
export function localDateString(date: Date, timeZone: string): string {
  const p = toLocalParts(date, timeZone);
  return `${p.year}-${pad2(p.month)}-${pad2(p.day)}`;
}

/** ローカル日付文字列に日数を足す(暦日ベース) */
export function addLocalDays(localDate: string, days: number): string {
  const [y, m, d] = localDate.split('-').map(Number) as [number, number, number];
  const t = Date.UTC(y, m - 1, d + days);
  const dt = new Date(t);
  return `${dt.getUTCFullYear()}-${pad2(dt.getUTCMonth() + 1)}-${pad2(dt.getUTCDate())}`;
}

export function weekdayOfLocalDate(localDate: string): number {
  const [y, m, d] = localDate.split('-').map(Number) as [number, number, number];
  return new Date(Date.UTC(y, m - 1, d)).getUTCDay();
}

export function pad2(n: number): string {
  return n.toString().padStart(2, '0');
}

export function isValidTimeString(s: string): boolean {
  const m = /^(\d{2}):(\d{2})$/.exec(s);
  if (!m) return false;
  const h = Number(m[1]);
  const mi = Number(m[2]);
  return h >= 0 && h <= 24 && mi >= 0 && mi < 60 && !(h === 24 && mi !== 0);
}

export function timeStringToMinutes(s: string): number {
  const [h, m] = s.split(':').map(Number) as [number, number];
  return h * 60 + m;
}

/** 指定タイムゾーンで date を含む暦月の [開始, 翌月開始) を UTC で返す */
export function monthRange(date: Date, timeZone: string): { from: Date; to: Date } {
  const p = toLocalParts(date, timeZone);
  const first = `${p.year}-${pad2(p.month)}-01`;
  const nextY = p.month === 12 ? p.year + 1 : p.year;
  const nextM = p.month === 12 ? 1 : p.month + 1;
  const next = `${nextY}-${pad2(nextM)}-01`;
  return { from: zonedToUtc(first, '00:00', timeZone), to: zonedToUtc(next, '00:00', timeZone) };
}
