import { beforeEach, describe, expect, it } from 'vitest';
import { jst, setupWorld, type TestWorld } from './helpers.js';

let w: TestWorld;
beforeEach(async () => {
  w = await setupWorld();
});

// 今 = 2026-10-01(木) 09:00 JST
describe('講師ごとのルール: 承認制にする日数', () => {
  it('7 日にすると、10 日後のレッスンは即時キャンセルでき、5 日後は承認制', async () => {
    await w.repos.hosts.update(w.host.id, { lateChangeThresholdDays: 7 });
    const far = await w.bookings.createBooking({ hostId: w.host.id, student: w.student, startAt: jst('2026-10-12T10:00:00') });
    expect((await w.bookings.requestChange({ bookingId: far.id, student: w.student, kind: 'cancel' })).type).toBe('applied');

    const near = await w.bookings.createBooking({ hostId: w.host.id, student: w.student, startAt: jst('2026-10-06T10:00:00') });
    await expect(w.bookings.requestChange({ bookingId: near.id, student: w.student, kind: 'cancel' })).rejects.toMatchObject({
      code: 'late_change_requires_request',
      message: 'レッスン開始まで7日未満のキャンセル・変更にはメッセージの入力が必要です',
    });
  });

  it('30 日にすると、20 日後のレッスンでも承認制', async () => {
    await w.repos.hosts.update(w.host.id, { lateChangeThresholdDays: 30 });
    const b = await w.bookings.createBooking({ hostId: w.host.id, student: w.student, startAt: jst('2026-10-21T10:00:00') });
    await expect(w.bookings.requestChange({ bookingId: b.id, student: w.student, kind: 'cancel' })).rejects.toMatchObject({
      code: 'late_change_requires_request',
    });
  });

  it('0 日にすると承認制にならず、翌日のレッスンも即時キャンセルできる', async () => {
    await w.repos.hosts.update(w.host.id, { lateChangeThresholdDays: 0 });
    const b = await w.bookings.createBooking({ hostId: w.host.id, student: w.student, startAt: jst('2026-10-02T10:00:00') });
    expect((await w.bookings.requestChange({ bookingId: b.id, student: w.student, kind: 'cancel' })).type).toBe('applied');
  });

  it('メールの文面が講師の日数に合わせて変わる(0 日なら承認の注意書きを出さない)', async () => {
    await w.repos.hosts.update(w.host.id, { lateChangeThresholdDays: 3 });
    await w.bookings.createBooking({ hostId: w.host.id, student: w.student, startAt: jst('2026-10-20T10:00:00') });
    expect(w.mail.to('student@example.com')[0]?.text).toContain('レッスン開始の3日前を過ぎると');

    await w.repos.hosts.update(w.host.id, { lateChangeThresholdDays: 0 });
    w.mail.clear();
    await w.bookings.createBooking({ hostId: w.host.id, student: w.student, startAt: jst('2026-10-21T10:00:00') });
    expect(w.mail.to('student@example.com')[0]?.text).not.toContain('承認が必要');

    await w.repos.hosts.update(w.host.id, { lateChangeThresholdDays: 14 });
    w.mail.clear();
    const b = await w.bookings.createBooking({ hostId: w.host.id, student: w.student, startAt: jst('2026-10-06T10:00:00') });
    await w.bookings.requestChange({ bookingId: b.id, student: w.student, kind: 'cancel', message: 'x', option: 'request_approval' });
    expect(w.mail.to('teacher@example.com').find((m) => m.subject.startsWith('【要承認】'))?.text).toContain('レッスン開始まで2週間未満の');
  });
});

describe('講師ごとのルール: 予約を受け付ける期間', () => {
  it('10 日にすると、空き枠は 10 日先までで、12 日後は予約できない', async () => {
    await w.repos.hosts.update(w.host.id, { bookingHorizonDays: 10 });
    const slots = await w.availability.listSlots(w.host.id);
    const last = slots.at(-1)!;
    expect(new Date(last.startAt).getTime()).toBeLessThanOrEqual(jst('2026-10-11T09:00:00').getTime());
    await expect(
      w.bookings.createBooking({ hostId: w.host.id, student: w.student, startAt: jst('2026-10-13T10:00:00') }),
    ).rejects.toMatchObject({ code: 'outside_booking_window', details: { horizonDays: 10 } });
  });

  it('上限の 60 日にすると、55 日後も予約できる', async () => {
    await w.repos.hosts.update(w.host.id, { bookingHorizonDays: 60 });
    const b = await w.bookings.createBooking({ hostId: w.host.id, student: w.student, startAt: jst('2026-11-25T10:00:00') });
    expect(b.status).toBe('confirmed');
  });
});
