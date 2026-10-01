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

export function yen(amount: number): string {
  return `${amount.toLocaleString('ja-JP')}円`;
}

/** 7 の倍数は「1週間」、それ以外は「10日」 */
export function daysLabel(days: number): string {
  return days % 7 === 0 ? `${days / 7}週間` : `${days}日`;
}

/** 対応方法の表示名。振替は講師の振替期間に合わせる */
export function optionLabel(
  options: { value: string; label: string }[],
  value: string,
  rescheduleRangeDays: number,
): string {
  if (value === 'reschedule_within_two_weeks') return `${daysLabel(rescheduleRangeDays)}以内の別日に振替を希望する`;
  return options.find((o) => o.value === value)?.label ?? value;
}
