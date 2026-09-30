import {
  addLocalDays,
  addMinutes,
  isValidTimeString,
  localDateString,
  timeStringToMinutes,
  weekdayOfLocalDate,
  zonedToUtc,
} from './time.js';
import type { AvailabilityWindow, BusyInterval, Slot } from './types.js';

export interface AvailabilityParams {
  windows: readonly AvailabilityWindow[];
  busy: readonly BusyInterval[];
  timezone: string;
  lessonMinutes: number;
  /** 枠を切り出す間隔(分)。省略時は lessonMinutes */
  stepMinutes?: number;
  /** この時刻以降の枠のみ(含む) */
  from: Date;
  /** この時刻以前に開始する枠のみ(含む) */
  to: Date;
}

/**
 * 営業時間枠から lessonMinutes の枠を切り出し、busy と重なるものを除いて返す。
 * 返り値は開始時刻昇順。
 */
export function computeAvailableSlots(params: AvailabilityParams): Slot[] {
  const { windows, busy, timezone, lessonMinutes, from, to } = params;
  const step = params.stepMinutes ?? lessonMinutes;
  if (lessonMinutes <= 0 || step <= 0) return [];
  if (from.getTime() > to.getTime()) return [];

  const busyRanges = busy
    .map((b) => ({ start: new Date(b.startAt).getTime(), end: new Date(b.endAt).getTime() }))
    .filter((b) => b.end > b.start)
    .sort((a, b) => a.start - b.start);

  const slots: Slot[] = [];
  // ローカル暦日で1日ずつ走査(from の前日から to の翌日までを見て境界の取りこぼしを防ぐ)
  const firstDay = addLocalDays(localDateString(from, timezone), -1);
  const lastDay = addLocalDays(localDateString(to, timezone), 1);

  for (let day = firstDay; day <= lastDay; day = addLocalDays(day, 1)) {
    const weekday = weekdayOfLocalDate(day);
    for (const w of windows) {
      if (w.weekday !== weekday) continue;
      if (!isValidTimeString(w.startTime) || !isValidTimeString(w.endTime)) continue;
      const startMin = timeStringToMinutes(w.startTime);
      const endMin = timeStringToMinutes(w.endTime);
      if (endMin <= startMin) continue;

      const windowStart = zonedToUtc(day, w.startTime, timezone);
      const windowEnd = addMinutes(windowStart, endMin - startMin);

      for (
        let s = windowStart;
        addMinutes(s, lessonMinutes).getTime() <= windowEnd.getTime();
        s = addMinutes(s, step)
      ) {
        const e = addMinutes(s, lessonMinutes);
        if (s.getTime() < from.getTime() || s.getTime() > to.getTime()) continue;
        if (overlapsAny(s.getTime(), e.getTime(), busyRanges)) continue;
        slots.push({ startAt: s.toISOString(), endAt: e.toISOString() });
      }
    }
  }

  slots.sort((a, b) => a.startAt.localeCompare(b.startAt));
  return dedupe(slots);
}

function overlapsAny(
  start: number,
  end: number,
  busy: readonly { start: number; end: number }[],
): boolean {
  for (const b of busy) {
    if (b.start >= end) break; // sorted → 以降は重ならない
    if (b.start < end && b.end > start) return true;
  }
  return false;
}

function dedupe(slots: Slot[]): Slot[] {
  const out: Slot[] = [];
  let prev: string | null = null;
  for (const s of slots) {
    if (s.startAt !== prev) out.push(s);
    prev = s.startAt;
  }
  return out;
}

/** 指定の開始時刻が空き枠一覧に含まれるか */
export function slotExists(slots: readonly Slot[], startAt: Date): boolean {
  const iso = startAt.toISOString();
  return slots.some((s) => s.startAt === iso);
}
