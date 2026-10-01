import { beforeEach, describe, expect, it } from 'vitest';
import { DomainError } from '../src/domain/errors.js';
import { jst, setupWorld, type TestWorld } from './helpers.js';

let w: TestWorld;
beforeEach(async () => {
  w = await setupWorld();
});

// 今 = 2026-10-01(木) 09:00 JST
const FAR = jst('2026-10-20T10:00:00'); // 19日先 → 猶予あり
const NEAR = jst('2026-10-06T10:00:00'); // 5日先 → 直前

describe('空き枠', () => {
  it('40日先までの平日枠だけが返り、連携カレンダーの予定が除かれる', async () => {
    w.calendar.seedBusy('private@group.calendar.google.com', [
      { startAt: jst('2026-10-02T10:00:00').toISOString(), endAt: jst('2026-10-02T12:00:00').toISOString() },
    ]);
    const slots = await w.availability.listSlots(w.host.id);
    const starts = new Set(slots.map((s) => s.startAt));
    expect(starts.has(jst('2026-10-02T10:00:00').toISOString())).toBe(false);
    expect(starts.has(jst('2026-10-02T11:00:00').toISOString())).toBe(false);
    expect(starts.has(jst('2026-10-02T12:00:00').toISOString())).toBe(true);
    // 土日は出ない
    expect(starts.has(jst('2026-10-03T10:00:00').toISOString())).toBe(false);
    // 40日 = 11/10(火) 09:00 JST が上限。11/10 10:00 は超える
    expect(starts.has(jst('2026-11-09T17:00:00').toISOString())).toBe(true);
    expect(starts.has(jst('2026-11-10T10:00:00').toISOString())).toBe(false);
    // 今日(木)の 10:00 は 1時間後なのでリード60分ちょうど → 可
    expect(starts.has(jst('2026-10-01T10:00:00').toISOString())).toBe(true);
  });
});

describe('予約作成', () => {
  it('空き枠を予約するとカレンダーにイベントが書かれ、その枠は空きから消える', async () => {
    const b = await w.bookings.createBooking({ hostId: w.host.id, student: w.student, startAt: FAR });
    expect(b.status).toBe('confirmed');
    expect(b.calendarEventId).toMatch(/^fake-event-/);
    expect(w.calendar.listEvents()).toHaveLength(1);
    expect(w.calendar.listEvents()[0]?.calendarId).toBe('primary');

    const slots = await w.availability.listSlots(w.host.id);
    expect(slots.some((s) => s.startAt === FAR.toISOString())).toBe(false);

    await expect(w.bookings.createBooking({ hostId: w.host.id, student: w.student, startAt: FAR })).rejects.toMatchObject({
      code: 'slot_unavailable',
    });
  });

  it('40日より先・営業時間外・過去は予約できない', async () => {
    await expect(
      w.bookings.createBooking({ hostId: w.host.id, student: w.student, startAt: jst('2026-11-12T10:00:00') }),
    ).rejects.toMatchObject({ code: 'outside_booking_window' });
    await expect(
      w.bookings.createBooking({ hostId: w.host.id, student: w.student, startAt: jst('2026-10-20T19:00:00') }),
    ).rejects.toMatchObject({ code: 'slot_unavailable' });
    await expect(
      w.bookings.createBooking({ hostId: w.host.id, student: w.student, startAt: jst('2026-09-30T10:00:00') }),
    ).rejects.toMatchObject({ code: 'outside_booking_window' });
  });
});

describe('キャンセル・変更(猶予あり: 14日以上前)', () => {
  it('キャンセルは即時反映され、カレンダーのイベントも消える', async () => {
    const b = await w.bookings.createBooking({ hostId: w.host.id, student: w.student, startAt: FAR });
    const out = await w.bookings.requestChange({ bookingId: b.id, student: w.student, kind: 'cancel' });
    expect(out.type).toBe('applied');
    expect(out.booking.status).toBe('cancelled');
    expect(w.calendar.listEvents()).toHaveLength(0);
  });

  it('変更は即時反映され、イベントの時刻も更新される', async () => {
    const b = await w.bookings.createBooking({ hostId: w.host.id, student: w.student, startAt: FAR });
    const newStart = jst('2026-10-21T11:00:00');
    const out = await w.bookings.requestChange({ bookingId: b.id, student: w.student, kind: 'reschedule', proposedStartAts: [newStart] });
    expect(out.type).toBe('applied');
    expect(out.booking.startAt).toBe(newStart.toISOString());
    expect(w.calendar.listEvents()[0]?.startAt).toBe(newStart.toISOString());
  });

  it('他人の予約は操作できない', async () => {
    const b = await w.bookings.createBooking({ hostId: w.host.id, student: w.student, startAt: FAR });
    const other = await w.repos.students.create({ email: 'other@example.com', name: 'C' });
    await expect(w.bookings.requestChange({ bookingId: b.id, student: other, kind: 'cancel' })).rejects.toMatchObject({
      code: 'forbidden',
    });
  });
});

describe('キャンセル・変更(直前: 14日未満)', () => {
  it('メッセージなしのキャンセルは拒否される', async () => {
    const b = await w.bookings.createBooking({ hostId: w.host.id, student: w.student, startAt: NEAR });
    await expect(w.bookings.requestChange({ bookingId: b.id, student: w.student, kind: 'cancel' })).rejects.toMatchObject({
      code: 'late_change_requires_request',
    });
    // 予約はそのまま
    expect((await w.repos.bookings.findById(b.id))?.status).toBe('confirmed');
  });

  it('メッセージ+対応方法があれば承認待ちになり、予約は確定のまま維持される', async () => {
    const b = await w.bookings.createBooking({ hostId: w.host.id, student: w.student, startAt: NEAR });
    const out = await w.bookings.requestChange({
      bookingId: b.id,
      student: w.student,
      kind: 'cancel',
      message: '急な出張が入りました',
      option: 'request_approval',
    });
    expect(out.type).toBe('pending_approval');
    if (out.type !== 'pending_approval') return;
    expect(out.request.status).toBe('pending');
    expect(out.booking.status).toBe('confirmed');
    expect(w.calendar.listEvents()).toHaveLength(1);

    // 二重要求は不可
    await expect(
      w.bookings.requestChange({ bookingId: b.id, student: w.student, kind: 'cancel', message: 'x', option: 'request_approval' }),
    ).rejects.toMatchObject({ code: 'change_request_pending' });
  });

  it('主催者が承認するとキャンセルが実行され、却下すると予約が残る', async () => {
    const b1 = await w.bookings.createBooking({ hostId: w.host.id, student: w.student, startAt: NEAR });
    const b2 = await w.bookings.createBooking({ hostId: w.host.id, student: w.student, startAt: jst('2026-10-07T10:00:00') });
    const r1 = await w.bookings.requestChange({ bookingId: b1.id, student: w.student, kind: 'cancel', message: 'a', option: 'request_approval' });
    const r2 = await w.bookings.requestChange({ bookingId: b2.id, student: w.student, kind: 'cancel', message: 'b', option: 'request_approval' });
    if (r1.type !== 'pending_approval' || r2.type !== 'pending_approval') throw new Error('unexpected');

    expect(await w.bookings.listPendingRequests(w.host.id)).toHaveLength(2);

    const approved = await w.bookings.decideRequest(r1.request.id, w.host.id, 'approve', '了解しました');
    expect(approved.request.status).toBe('approved');
    expect(approved.booking.status).toBe('cancelled');
    expect(approved.booking.cancellationFeeStatus).toBe('none');

    const rejected = await w.bookings.decideRequest(r2.request.id, w.host.id, 'reject', '直前のため対応できません');
    expect(rejected.request.status).toBe('rejected');
    expect(rejected.booking.status).toBe('confirmed');

    expect(await w.bookings.listPendingRequests(w.host.id)).toHaveLength(0);
    // 処理済みは再判断できない
    await expect(w.bookings.decideRequest(r1.request.id, w.host.id, 'reject')).rejects.toMatchObject({ code: 'invalid_state' });
  });

  it('「キャンセルフィーを支払う」で承認されるとフィー未払い状態になり、主催者が入金確認できる', async () => {
    const b = await w.bookings.createBooking({ hostId: w.host.id, student: w.student, startAt: NEAR });
    const r = await w.bookings.requestChange({ bookingId: b.id, student: w.student, kind: 'cancel', message: 'すみません', option: 'pay_cancellation_fee', feeMethod: 'in_person' });
    if (r.type !== 'pending_approval') throw new Error('unexpected');
    const { booking } = await w.bookings.decideRequest(r.request.id, w.host.id, 'approve');
    expect(booking.status).toBe('cancelled');
    expect(booking.cancellationFeeStatus).toBe('pending');
    const paid = await w.bookings.markFeePaid(b.id, w.host.id);
    expect(paid.cancellationFeeStatus).toBe('paid');
  });

  it('「1週間以内の別日に振替」は振替先が必須で、承認時に予約日時とイベントが更新される', async () => {
    const b = await w.bookings.createBooking({ hostId: w.host.id, student: w.student, startAt: NEAR });
    await expect(
      w.bookings.requestChange({ bookingId: b.id, student: w.student, kind: 'reschedule', message: 'x', option: 'reschedule_within_two_weeks' }),
    ).rejects.toMatchObject({ code: 'validation' });

    // 元の日(10/6)から7日超の 10/14 は不可
    await expect(
      w.bookings.requestChange({
        bookingId: b.id,
        student: w.student,
        kind: 'reschedule',
        message: 'x',
        option: 'reschedule_within_two_weeks',
        proposedStartAts: [jst('2026-10-14T10:00:00')],
      }),
    ).rejects.toMatchObject({ code: 'validation' });

    const proposed = jst('2026-10-12T14:00:00');
    const r = await w.bookings.requestChange({
      bookingId: b.id,
      student: w.student,
      kind: 'reschedule',
      message: '翌週に振り替えたいです',
      option: 'reschedule_within_two_weeks',
      proposedStartAts: [proposed],
    });
    if (r.type !== 'pending_approval') throw new Error('unexpected');
    expect(r.request.proposedStartAts).toEqual([proposed.toISOString()]);
    // 承認待ちの間は元の枠が確定のまま(他の生徒はその枠を取れない)
    expect((await w.availability.listSlots(w.host.id)).some((s) => s.startAt === NEAR.toISOString())).toBe(false);

    const { booking } = await w.bookings.decideRequest(r.request.id, w.host.id, 'approve');
    expect(booking.status).toBe('confirmed');
    expect(booking.startAt).toBe(proposed.toISOString());
    expect(w.calendar.listEvents()[0]?.startAt).toBe(proposed.toISOString());
    // 元の枠は空きに戻る
    expect((await w.availability.listSlots(w.host.id)).some((s) => s.startAt === NEAR.toISOString())).toBe(true);
  });

  it('振替先が他の予約で埋まっていれば要求時点で拒否される', async () => {
    const b = await w.bookings.createBooking({ hostId: w.host.id, student: w.student, startAt: NEAR });
    const other = await w.repos.students.create({ email: 'other@example.com', name: 'C' });
    const taken = jst('2026-10-08T10:00:00');
    await w.bookings.createBooking({ hostId: w.host.id, student: other, startAt: taken });
    await expect(
      w.bookings.requestChange({
        bookingId: b.id,
        student: w.student,
        kind: 'reschedule',
        message: 'x',
        option: 'reschedule_within_two_weeks',
        proposedStartAts: [taken],
      }),
    ).rejects.toMatchObject({ code: 'slot_unavailable' });
  });

  it('時間の経過で猶予ありの予約が直前扱いに変わる', async () => {
    const b = await w.bookings.createBooking({ hostId: w.host.id, student: w.student, startAt: FAR });
    w.clock.advanceDays(10); // 10/11 → レッスン(10/20)まで9日
    await expect(w.bookings.requestChange({ bookingId: b.id, student: w.student, kind: 'cancel' })).rejects.toMatchObject({
      code: 'late_change_requires_request',
    });
  });

  it('他の主催者は判断できない', async () => {
    const b = await w.bookings.createBooking({ hostId: w.host.id, student: w.student, startAt: NEAR });
    const r = await w.bookings.requestChange({ bookingId: b.id, student: w.student, kind: 'cancel', message: 'x', option: 'request_approval' });
    if (r.type !== 'pending_approval') throw new Error('unexpected');
    const otherHost = await w.repos.hosts.create({
      email: 'h2@example.com',
      displayName: 'B',
      slug: 'host-b',
      bio: '',
      plan: 'free',
      subscriptionStatus: 'none',
      stripeCustomerId: null,
      stripeSubscriptionId: null,
      cancellationFeeAmount: null,
      stripeConnectAccountId: null,
      connectChargesEnabled: false,
      feeMethods: ['bank_transfer', 'in_person', 'card'],
      bankTransferInfo: '',
      organizationId: null,
      orgPlanActive: false,
      timezone: 'Asia/Tokyo',
      lessonMinutes: 60,
      rescheduleRangeDays: 7,
      lateChangeThresholdDays: 14,
      bookingHorizonDays: 40,
      minLeadMinutes: 0,
    });
    await expect(w.bookings.decideRequest(r.request.id, otherHost.id, 'approve')).rejects.toBeInstanceOf(DomainError);
  });
});
