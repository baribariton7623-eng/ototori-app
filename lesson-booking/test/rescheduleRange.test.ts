import { beforeEach, describe, expect, it } from 'vitest';
import { lateChangeOptionLabel } from '../src/domain/rules.js';
import { jst, setupWorld, type TestWorld } from './helpers.js';

let w: TestWorld;
beforeEach(async () => {
  w = await setupWorld();
});

// 今 = 2026-10-01(木) 09:00 JST。10/6(火) 10:00 は直前(承認制)
const NEAR = jst('2026-10-06T10:00:00');

async function request(proposed: Date, bookingId?: string) {
  const id = bookingId ?? (await w.bookings.createBooking({ hostId: w.host.id, student: w.student, startAt: NEAR })).id;
  return w.bookings.requestChange({
    bookingId: id,
    student: w.student,
    kind: 'reschedule',
    option: 'reschedule_within_two_weeks',
    message: '振替希望です',
    proposedStartAts: [proposed],
  });
}

describe('講師ごとの振替期間', () => {
  it('表示名は期間に合わせて変わる', () => {
    expect(lateChangeOptionLabel('reschedule_within_two_weeks', 7)).toBe('1週間以内の別日に振替を希望する');
    expect(lateChangeOptionLabel('reschedule_within_two_weeks', 14)).toBe('2週間以内の別日に振替を希望する');
    expect(lateChangeOptionLabel('reschedule_within_two_weeks', 3)).toBe('3日以内の別日に振替を希望する');
    expect(lateChangeOptionLabel('request_approval', 3)).toBe('事情を説明して承認を求める');
  });

  it('期間を 3 日にすると 5 日後は申請できず、3 日後はできる', async () => {
    await w.repos.hosts.update(w.host.id, { rescheduleRangeDays: 3 });
    const b = await w.bookings.createBooking({ hostId: w.host.id, student: w.student, startAt: NEAR });
    await expect(request(jst('2026-10-11T10:00:00'), b.id)).rejects.toMatchObject({ code: 'validation', details: { rangeDays: 3 } });
    const ok = await request(jst('2026-10-09T10:00:00'), b.id);
    expect(ok.type).toBe('pending_approval');
  });

  it('期間を 14 日にすると 13 日後でも申請でき、講師へのメールの表示名も変わる', async () => {
    await w.repos.hosts.update(w.host.id, { rescheduleRangeDays: 14 });
    w.mail.clear();
    const r = await request(jst('2026-10-19T10:00:00'));
    expect(r.type).toBe('pending_approval');
    const mail = w.mail.to('teacher@example.com').find((m) => m.subject.startsWith('【要承認】'));
    expect(mail?.text).toContain('対応方法: 2週間以内の別日に振替を希望する');
  });

  it('申請後に講師が期間を縮めても、受け付けた希望日時で承認できる', async () => {
    const r = await request(jst('2026-10-12T10:00:00'));
    if (r.type !== 'pending_approval') throw new Error('unexpected');
    await w.repos.hosts.update(w.host.id, { rescheduleRangeDays: 1 });
    const { booking } = await w.bookings.decideRequest(r.request.id, w.host.id, 'approve');
    expect(booking.startAt).toBe(jst('2026-10-12T10:00:00').toISOString());
  });
});
