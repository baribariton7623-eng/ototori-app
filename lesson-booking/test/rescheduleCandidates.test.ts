import { beforeEach, describe, expect, it } from 'vitest';
import { jst, setupWorld, type TestWorld } from './helpers.js';

let w: TestWorld;
beforeEach(async () => {
  w = await setupWorld();
});

// 今 = 2026-10-01(木) 09:00 JST。10/6 は直前(承認制)
const NEAR = jst('2026-10-06T10:00:00');
// 元の日(10/6)から前後7日以内
const C1 = jst('2026-10-13T10:00:00');
const C2 = jst('2026-10-12T11:00:00');
const C3 = jst('2026-10-09T14:00:00');

async function lateBooking() {
  return w.bookings.createBooking({ hostId: w.host.id, student: w.student, startAt: NEAR });
}
function reschedule(bookingId: string, proposedStartAts: Date[]) {
  return w.bookings.requestChange({
    bookingId,
    student: w.student,
    kind: 'reschedule',
    option: 'reschedule_within_two_weeks',
    message: '出張のため振り替えたいです',
    proposedStartAts,
  });
}

describe('振替の第1〜第3希望', () => {
  it('3 つまで順位付きで申請でき、講師へのメールに第1〜第3希望が並ぶ', async () => {
    const b = await lateBooking();
    w.mail.clear();
    const r = await reschedule(b.id, [C2, C1, C3]);
    if (r.type !== 'pending_approval') throw new Error('unexpected');
    expect(r.request.proposedStartAts).toEqual([C2, C1, C3].map((d) => d.toISOString()));
    const text = w.mail.to('teacher@example.com')[0]?.text ?? '';
    expect(text).toContain('第1希望: 2026/10/12(月) 11:00');
    expect(text).toContain('第2希望: 2026/10/13(火) 10:00');
    expect(text).toContain('第3希望: 2026/10/9(金) 14:00');
  });

  it('0 件・4 件以上・重複・今と同じ日時・範囲外は申請できない', async () => {
    const b = await lateBooking();
    await expect(reschedule(b.id, [])).rejects.toMatchObject({ code: 'validation' });
    await expect(reschedule(b.id, [C1, C2, C3, jst('2026-10-16T10:00:00')])).rejects.toMatchObject({ code: 'validation' });
    await expect(reschedule(b.id, [C1, C1])).rejects.toMatchObject({ code: 'validation' });
    await expect(reschedule(b.id, [C1, NEAR])).rejects.toMatchObject({ code: 'validation' });
    // 元の日から 7 日 1 時間後は範囲外
    await expect(reschedule(b.id, [C1, jst('2026-10-13T11:00:00')])).rejects.toMatchObject({ code: 'validation' });
  });

  it('埋まっている候補があると、何番目の希望かを示して拒否する', async () => {
    const b = await lateBooking();
    const other = await w.repos.students.create({ email: 'o@example.com', name: 'O' });
    await w.bookings.createBooking({ hostId: w.host.id, student: other, startAt: C2 });
    await expect(reschedule(b.id, [C1, C2])).rejects.toMatchObject({ code: 'slot_unavailable', details: { rank: 2 } });
  });

  it('候補が複数なら講師は 1 つを選んで承認する。選んだ日時に振り替わり記録される', async () => {
    const b = await lateBooking();
    const r = await reschedule(b.id, [C1, C2, C3]);
    if (r.type !== 'pending_approval') throw new Error('unexpected');

    await expect(w.bookings.decideRequest(r.request.id, w.host.id, 'approve')).rejects.toMatchObject({ code: 'validation', details: { field: 'startAt' } });
    await expect(w.bookings.decideRequest(r.request.id, w.host.id, 'approve', undefined, jst('2026-10-16T10:00:00'))).rejects.toMatchObject({
      code: 'validation',
    });

    w.mail.clear();
    const { booking, request } = await w.bookings.decideRequest(r.request.id, w.host.id, 'approve', '第2希望でお願いします', C2);
    expect(booking.startAt).toBe(C2.toISOString());
    expect(request.approvedStartAt).toBe(C2.toISOString());
    expect(w.calendar.listEvents()[0]?.startAt).toBe(C2.toISOString());
    expect(w.mail.to('student@example.com')[0]?.text).toContain('変更後: 2026/10/12(月) 11:00〜12:00');
  });

  it('候補が 1 つなら選ばなくても承認できる', async () => {
    const b = await lateBooking();
    const r = await reschedule(b.id, [C3]);
    if (r.type !== 'pending_approval') throw new Error('unexpected');
    const { booking } = await w.bookings.decideRequest(r.request.id, w.host.id, 'approve');
    expect(booking.startAt).toBe(C3.toISOString());
  });

  it('申請後に埋まった候補は承認画面で「空いていない」と表示され、その候補では承認できない', async () => {
    const b = await lateBooking();
    const r = await reschedule(b.id, [C1, C2]);
    if (r.type !== 'pending_approval') throw new Error('unexpected');
    // 候補の枠は確保しないので、他の生徒が第1希望の枠を予約できる
    const other = await w.repos.students.create({ email: 'o@example.com', name: 'O' });
    await w.bookings.createBooking({ hostId: w.host.id, student: other, startAt: C1 });

    expect(await w.bookings.candidateAvailability(r.request)).toEqual([
      { startAt: C1.toISOString(), available: false },
      { startAt: C2.toISOString(), available: true },
    ]);
    await expect(w.bookings.decideRequest(r.request.id, w.host.id, 'approve', undefined, C1)).rejects.toMatchObject({ code: 'slot_unavailable' });
    // 失敗しても申請は承認待ちのまま。別の候補で承認できる
    const { booking } = await w.bookings.decideRequest(r.request.id, w.host.id, 'approve', undefined, C2);
    expect(booking.startAt).toBe(C2.toISOString());
  });

  it('開始 2 週間以上前の変更は即時反映なので、希望日時は 1 つだけ', async () => {
    const b = await w.bookings.createBooking({ hostId: w.host.id, student: w.student, startAt: jst('2026-10-20T10:00:00') });
    await expect(
      w.bookings.requestChange({ bookingId: b.id, student: w.student, kind: 'reschedule', proposedStartAts: [jst('2026-10-21T10:00:00'), jst('2026-10-22T10:00:00')] }),
    ).rejects.toMatchObject({ code: 'validation' });
    const ok = await w.bookings.requestChange({ bookingId: b.id, student: w.student, kind: 'reschedule', proposedStartAts: [jst('2026-10-21T10:00:00')] });
    expect(ok.type).toBe('applied');
  });
});
