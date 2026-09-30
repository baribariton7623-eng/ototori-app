export const WEEKDAY_JA = ['日', '月', '火', '水', '木', '金', '土'] as const;

const TZ = 'Asia/Tokyo';
const dateFmt = new Intl.DateTimeFormat('ja-JP', { timeZone: TZ, month: 'numeric', day: 'numeric', weekday: 'short' });
const timeFmt = new Intl.DateTimeFormat('ja-JP', { timeZone: TZ, hour: '2-digit', minute: '2-digit', hourCycle: 'h23' });
const fullFmt = new Intl.DateTimeFormat('ja-JP', {
  timeZone: TZ,
  year: 'numeric',
  month: 'numeric',
  day: 'numeric',
  weekday: 'short',
  hour: '2-digit',
  minute: '2-digit',
  hourCycle: 'h23',
});
const keyFmt = new Intl.DateTimeFormat('en-CA', { timeZone: TZ, year: 'numeric', month: '2-digit', day: '2-digit' });

export function fmtDate(iso: string): string {
  return dateFmt.format(new Date(iso));
}
export function fmtTime(iso: string): string {
  return timeFmt.format(new Date(iso));
}
export function fmtRange(startIso: string, endIso: string): string {
  return `${fullFmt.format(new Date(startIso))}〜${fmtTime(endIso)}`;
}
export function fmtFull(iso: string): string {
  return fullFmt.format(new Date(iso));
}

/** JST のローカル日付キー (YYYY-MM-DD) */
export function dateKey(iso: string): string {
  return keyFmt.format(new Date(iso));
}

export function daysUntil(iso: string, now = new Date()): number {
  return (new Date(iso).getTime() - now.getTime()) / 86_400_000;
}

export function addDays(d: Date, n: number): Date {
  return new Date(d.getTime() + n * 86_400_000);
}
