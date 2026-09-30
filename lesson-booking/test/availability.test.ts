import { describe, expect, it } from 'vitest';
import { computeAvailableSlots } from '../src/domain/availability.js';
import { zonedToUtc } from '../src/domain/time.js';
import type { AvailabilityWindow } from '../src/domain/types.js';
import { jst } from './helpers.js';

const win = (weekday: AvailabilityWindow['weekday'], startTime: string, endTime: string): AvailabilityWindow => ({
  id: `${weekday}-${startTime}`,
  hostId: 'h1',
  weekday,
  startTime,
  endTime,
});

describe('zonedToUtc', () => {
  it('JST のローカル時刻を UTC に変換する', () => {
    expect(zonedToUtc('2026-10-05', '10:00', 'Asia/Tokyo').toISOString()).toBe('2026-10-05T01:00:00.000Z');
  });
  it('DST のあるタイムゾーンでも変換できる', () => {
    // ニューヨーク 2026-07-01 は EDT(-4)
    expect(zonedToUtc('2026-07-01', '10:00', 'America/New_York').toISOString()).toBe('2026-07-01T14:00:00.000Z');
    // 2026-01-15 は EST(-5)
    expect(zonedToUtc('2026-01-15', '10:00', 'America/New_York').toISOString()).toBe('2026-01-15T15:00:00.000Z');
  });
});

describe('computeAvailableSlots', () => {
  it('営業時間枠を60分刻みに切り出す(月曜 10:00-13:00 → 3枠)', () => {
    const slots = computeAvailableSlots({
      windows: [win(1, '10:00', '13:00')],
      busy: [],
      timezone: 'Asia/Tokyo',
      lessonMinutes: 60,
      from: jst('2026-10-05T00:00:00'),
      to: jst('2026-10-05T23:59:00'),
    });
    expect(slots.map((s) => s.startAt)).toEqual([
      jst('2026-10-05T10:00:00').toISOString(),
      jst('2026-10-05T11:00:00').toISOString(),
      jst('2026-10-05T12:00:00').toISOString(),
    ]);
  });

  it('busy と重なる枠を除外する(部分的な重なりも除外)', () => {
    const slots = computeAvailableSlots({
      windows: [win(1, '10:00', '13:00')],
      busy: [{ startAt: jst('2026-10-05T10:30:00').toISOString(), endAt: jst('2026-10-05T11:30:00').toISOString() }],
      timezone: 'Asia/Tokyo',
      lessonMinutes: 60,
      from: jst('2026-10-05T00:00:00'),
      to: jst('2026-10-05T23:59:00'),
    });
    expect(slots.map((s) => s.startAt)).toEqual([jst('2026-10-05T12:00:00').toISOString()]);
  });

  it('隣接する busy(終了=開始)は重なりとみなさない', () => {
    const slots = computeAvailableSlots({
      windows: [win(1, '10:00', '12:00')],
      busy: [{ startAt: jst('2026-10-05T09:00:00').toISOString(), endAt: jst('2026-10-05T10:00:00').toISOString() }],
      timezone: 'Asia/Tokyo',
      lessonMinutes: 60,
      from: jst('2026-10-05T00:00:00'),
      to: jst('2026-10-05T23:59:00'),
    });
    expect(slots).toHaveLength(2);
  });

  it('複数カレンダー由来の busy をまとめて適用できる', () => {
    const slots = computeAvailableSlots({
      windows: [win(1, '10:00', '14:00')],
      busy: [
        { startAt: jst('2026-10-05T10:00:00').toISOString(), endAt: jst('2026-10-05T11:00:00').toISOString() },
        { startAt: jst('2026-10-05T12:00:00').toISOString(), endAt: jst('2026-10-05T13:00:00').toISOString() },
      ],
      timezone: 'Asia/Tokyo',
      lessonMinutes: 60,
      from: jst('2026-10-05T00:00:00'),
      to: jst('2026-10-05T23:59:00'),
    });
    expect(slots.map((s) => s.startAt)).toEqual([
      jst('2026-10-05T11:00:00').toISOString(),
      jst('2026-10-05T13:00:00').toISOString(),
    ]);
  });

  it('from/to の範囲外の枠は返さない', () => {
    const slots = computeAvailableSlots({
      windows: [win(1, '10:00', '13:00')],
      busy: [],
      timezone: 'Asia/Tokyo',
      lessonMinutes: 60,
      from: jst('2026-10-05T11:00:00'),
      to: jst('2026-10-05T11:00:00'),
    });
    expect(slots.map((s) => s.startAt)).toEqual([jst('2026-10-05T11:00:00').toISOString()]);
  });

  it('曜日が違う枠は出ない・レッスン長が枠に収まらない端は出ない', () => {
    const slots = computeAvailableSlots({
      windows: [win(2, '10:00', '11:30')],
      busy: [],
      timezone: 'Asia/Tokyo',
      lessonMinutes: 60,
      from: jst('2026-10-05T00:00:00'),
      to: jst('2026-10-06T23:59:00'),
    });
    // 火曜(10/6) 10:00 のみ。10:30 開始は 11:30 終了で収まるが刻みが60分なので出ない。
    expect(slots.map((s) => s.startAt)).toEqual([jst('2026-10-06T10:00:00').toISOString()]);
  });

  it('日付境界をまたぐ UTC でもローカル曜日で判定する(JST 月曜 00:30 = UTC 日曜)', () => {
    const slots = computeAvailableSlots({
      windows: [win(1, '00:00', '02:00')],
      busy: [],
      timezone: 'Asia/Tokyo',
      lessonMinutes: 60,
      from: jst('2026-10-05T00:00:00'),
      to: jst('2026-10-05T23:59:00'),
    });
    expect(slots.map((s) => s.startAt)).toEqual([
      '2026-10-04T15:00:00.000Z',
      '2026-10-04T16:00:00.000Z',
    ]);
  });
});
