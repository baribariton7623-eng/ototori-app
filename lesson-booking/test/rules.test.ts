import { describe, expect, it } from 'vitest';
import { DomainError } from '../src/domain/errors.js';
import {
  BOOKING_HORIZON_DAYS,
  isLateChange,
  isWithinBookingWindow,
  isWithinRescheduleRange,
  validateLateChangeRequest,
} from '../src/domain/rules.js';
import type { Booking } from '../src/domain/types.js';
import { NOW, jst } from './helpers.js';

const booking: Booking = {
  id: 'b1',
  hostId: 'h1',
  studentId: 's1',
  startAt: jst('2026-10-10T10:00:00').toISOString(),
  endAt: jst('2026-10-10T11:00:00').toISOString(),
  status: 'confirmed',
  calendarEventId: null,
  note: null,
  cancellationFeeStatus: 'none',
  createdAt: NOW.toISOString(),
  updatedAt: NOW.toISOString(),
};

describe('予約受付ウィンドウ(40日先まで)', () => {
  it('40日ちょうど先は予約可、40日+1分先は不可', () => {
    const limit = new Date(NOW.getTime() + BOOKING_HORIZON_DAYS * 86_400_000);
    expect(isWithinBookingWindow(limit, NOW, 0)).toBe(true);
    expect(isWithinBookingWindow(new Date(limit.getTime() + 60_000), NOW, 0)).toBe(false);
  });
  it('リード時間より手前は不可', () => {
    expect(isWithinBookingWindow(new Date(NOW.getTime() + 30 * 60_000), NOW, 60)).toBe(false);
    expect(isWithinBookingWindow(new Date(NOW.getTime() + 60 * 60_000), NOW, 60)).toBe(true);
  });
});

describe('直前変更の判定(14日未満)', () => {
  it('14日ちょうど先は直前扱いではない', () => {
    expect(isLateChange(new Date(NOW.getTime() + 14 * 86_400_000), NOW)).toBe(false);
  });
  it('13日23時間先は直前扱い', () => {
    expect(isLateChange(new Date(NOW.getTime() + 14 * 86_400_000 - 3_600_000), NOW)).toBe(true);
  });
});

describe('振替範囲(元の日から2週間以内)', () => {
  const original = jst('2026-10-10T10:00:00');
  it('前後14日以内は可', () => {
    expect(isWithinRescheduleRange(original, jst('2026-10-24T10:00:00'))).toBe(true);
    expect(isWithinRescheduleRange(original, jst('2026-09-26T10:00:00'))).toBe(true);
  });
  it('14日を超えると不可', () => {
    expect(isWithinRescheduleRange(original, jst('2026-10-24T11:00:00'))).toBe(false);
  });
});

describe('直前変更要求の入力検証', () => {
  it('メッセージが空なら拒否', () => {
    expect(() =>
      validateLateChangeRequest(booking, { kind: 'cancel', option: 'request_approval', message: '  ', proposedStartAt: undefined }),
    ).toThrowError(DomainError);
  });
  it('対応方法が未選択なら拒否', () => {
    try {
      validateLateChangeRequest(booking, { kind: 'cancel', option: undefined, message: '体調不良のため', proposedStartAt: undefined });
      expect.unreachable();
    } catch (e) {
      expect((e as DomainError).code).toBe('late_change_requires_request');
      expect((e as DomainError).details).toMatchObject({ field: 'option' });
    }
  });
  it('3択それぞれが受理される(キャンセル)', () => {
    for (const option of ['request_approval', 'pay_cancellation_fee'] as const) {
      const v = validateLateChangeRequest(booking, { kind: 'cancel', option, message: '事情説明', proposedStartAt: undefined });
      expect(v.option).toBe(option);
      expect(v.proposedStartAt).toBeNull();
    }
  });
  it('振替希望は振替先が必須で、元の日から2週間以内', () => {
    expect(() =>
      validateLateChangeRequest(booking, { kind: 'cancel', option: 'reschedule_within_two_weeks', message: 'x', proposedStartAt: undefined }),
    ).toThrowError(/振替希望日時/);
    expect(() =>
      validateLateChangeRequest(booking, {
        kind: 'reschedule',
        option: 'reschedule_within_two_weeks',
        message: 'x',
        proposedStartAt: jst('2026-11-01T10:00:00'),
      }),
    ).toThrowError(/14日以内/);
    const ok = validateLateChangeRequest(booking, {
      kind: 'reschedule',
      option: 'reschedule_within_two_weeks',
      message: 'x',
      proposedStartAt: jst('2026-10-17T10:00:00'),
    });
    expect(ok.proposedStartAt?.toISOString()).toBe(jst('2026-10-17T10:00:00').toISOString());
  });
});
