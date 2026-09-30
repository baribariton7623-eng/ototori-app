import { beforeEach, describe, expect, it } from 'vitest';
import { jst, setupWorld, type TestWorld } from './helpers.js';

let w: TestWorld;
beforeEach(async () => {
  w = await setupWorld();
});

// 今 = 2026-10-01(木) 09:00 JST
describe('前日リマインド', () => {
  it('24 時間以内に始まる確定予約に 1 回だけ送る', async () => {
    const tomorrow = await w.bookings.createBooking({ hostId: w.host.id, student: w.student, startAt: jst('2026-10-02T10:00:00') });
    const later = await w.bookings.createBooking({ hostId: w.host.id, student: w.student, startAt: jst('2026-10-05T10:00:00') });
    w.mail.clear();

    // 10/1 09:00 時点では 10/2 10:00 は 25 時間後 → 対象外
    expect(await w.reminders.runOnce()).toEqual({ checked: 0, sent: 0, failed: 0 });

    // 10/1 10:30 → 10/2 10:00 は 23.5 時間後 → 送る
    w.clock.current = jst('2026-10-01T10:30:00');
    expect(await w.reminders.runOnce()).toEqual({ checked: 1, sent: 1, failed: 0 });
    expect(w.mail.sent).toHaveLength(1);
    expect(w.mail.sent[0]?.to).toBe('student@example.com');
    expect(w.mail.sent[0]?.subject).toBe('【明日のレッスン】講師A 2026/10/2(金) 10:00');
    expect((await w.repos.bookings.findById(tomorrow.id))?.reminderSentAt).not.toBeNull();

    // 再実行しても二重送信しない
    expect((await w.reminders.runOnce()).sent).toBe(0);
    expect(w.mail.sent).toHaveLength(1);
    expect((await w.repos.bookings.findById(later.id))?.reminderSentAt).toBeNull();
  });

  it('キャンセル済みには送らない。日時変更後は新しい日時で送り直す', async () => {
    const a = await w.bookings.createBooking({ hostId: w.host.id, student: w.student, startAt: jst('2026-10-02T10:00:00') });
    const b = await w.bookings.createBooking({ hostId: w.host.id, student: w.student, startAt: jst('2026-10-02T11:00:00') });
    await w.bookings.cancelByHost(a.id, w.host.id, '休講');
    w.clock.current = jst('2026-10-01T12:00:00');
    expect((await w.reminders.runOnce()).sent).toBe(1);

    // b を承認経由で 10/5 に振替 → reminderSentAt がリセットされる
    const r = await w.bookings.requestChange({
      bookingId: b.id,
      student: w.student,
      kind: 'reschedule',
      option: 'reschedule_within_two_weeks',
      message: '都合が悪くなりました',
      proposedStartAts: [jst('2026-10-05T10:00:00')],
    });
    if (r.type !== 'pending_approval') throw new Error('unexpected');
    const { booking } = await w.bookings.decideRequest(r.request.id, w.host.id, 'approve');
    expect(booking.reminderSentAt).toBeNull();

    w.mail.clear();
    w.clock.current = jst('2026-10-04T12:00:00');
    expect((await w.reminders.runOnce()).sent).toBe(1);
    expect(w.mail.sent[0]?.subject).toContain('2026/10/5(月) 10:00');
  });

  it('送信に失敗したら印を付けず、次回に再試行する', async () => {
    const a = await w.bookings.createBooking({ hostId: w.host.id, student: w.student, startAt: jst('2026-10-02T10:00:00') });
    w.clock.current = jst('2026-10-01T12:00:00');
    w.mail.failNext = true;
    expect(await w.reminders.runOnce()).toEqual({ checked: 1, sent: 0, failed: 1 });
    expect((await w.repos.bookings.findById(a.id))?.reminderSentAt).toBeNull();
    expect(await w.reminders.runOnce()).toEqual({ checked: 1, sent: 1, failed: 0 });
  });
});
