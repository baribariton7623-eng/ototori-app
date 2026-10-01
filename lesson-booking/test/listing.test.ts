import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { PAST_BOOKINGS_DAYS } from '../src/http/common.js';
import { devUser, insertBooking, jst, setupWorld, startApi, type TestApi, type TestWorld } from './helpers.js';

const TEACHER = devUser('teacher@example.com', '講師A');
const STUDENT = devUser('student@example.com', '生徒B');

let w: TestWorld;
let api: TestApi;
beforeEach(async () => {
  w = await setupWorld();
  api = await startApi(w);
});
afterEach(() => api.close());

describe('予約一覧の取得', () => {
  it(`過去分は ${PAST_BOOKINGS_DAYS} 日前まで。キャンセルフィー未払いの予約は古くても含める`, async () => {
    // 今 = 10/1。7/15 は 78 日前(60 日より前なので出さない)、8/15 は 47 日前
    const old = await insertBooking(w, jst('2026-07-15T10:00:00'), { status: 'cancelled' });
    const oldUnpaid = await insertBooking(w, jst('2026-05-02T10:00:00'), {
      status: 'cancelled',
      cancellationFeeStatus: 'pending',
      cancellationFeeAmount: 3000,
      cancellationFeeMethod: 'bank_transfer',
    });
    const recent = await insertBooking(w, jst('2026-08-15T10:00:00'));
    const upcoming = await insertBooking(w, jst('2026-10-20T10:00:00'));

    const ids = (r: { json: { id: string }[] }) => r.json.map((b) => b.id);
    const student = await api.call('GET', '/bookings', STUDENT);
    expect(student.status).toBe(200);
    expect(ids(student)).toEqual([oldUnpaid.id, recent.id, upcoming.id]);
    const host = await api.call('GET', `/hosts/${w.host.id}/bookings`, TEACHER);
    expect(ids(host)).toEqual([oldUnpaid.id, recent.id, upcoming.id]);
    expect(host.json[0].student).toEqual({ id: w.student.id, email: w.student.email, name: w.student.name });

    // since を指定すればさらに前も取れる
    const all = await api.call('GET', `/bookings?since=${encodeURIComponent('2026-01-01T00:00:00Z')}`, STUDENT);
    expect(ids(all)).toEqual([oldUnpaid.id, old.id, recent.id, upcoming.id]);
    expect((await api.call('GET', '/bookings?since=yesterday', STUDENT)).status).toBe(400);
  });

  it('生徒の一覧に各予約の変更要求が含まれる(予約ごとの詳細取得は不要)', async () => {
    const b = await w.bookings.createBooking({ hostId: w.host.id, student: w.student, startAt: jst('2026-10-06T10:00:00') });
    const other = await w.bookings.createBooking({ hostId: w.host.id, student: w.student, startAt: jst('2026-10-27T10:00:00') });
    await w.bookings.requestChange({ bookingId: b.id, student: w.student, kind: 'cancel', option: 'request_approval', message: '体調不良' });

    const r = await api.call('GET', '/bookings', STUDENT);
    const byId = new Map<string, { changeRequests: unknown[] }>(r.json.map((x: { id: string; changeRequests: unknown[] }) => [x.id, x]));
    expect(byId.get(b.id)?.changeRequests).toHaveLength(1);
    expect(byId.get(b.id)?.changeRequests[0]).toMatchObject({ kind: 'cancel', status: 'pending', message: '体調不良' });
    expect(byId.get(other.id)?.changeRequests).toEqual([]);
  });

  it('承認待ちの件数はカレンダーに問い合わせずに返す', async () => {
    const b = await w.bookings.createBooking({ hostId: w.host.id, student: w.student, startAt: jst('2026-10-06T10:00:00') });
    await w.bookings.requestChange({
      bookingId: b.id,
      student: w.student,
      kind: 'reschedule',
      option: 'reschedule_within_two_weeks',
      message: '振替希望',
      proposedStartAts: [jst('2026-10-08T10:00:00')],
    });
    let calls = 0;
    const original = w.calendar.freeBusy.bind(w.calendar);
    w.calendar.freeBusy = async (...args) => {
      calls++;
      return original(...args);
    };
    const r = await api.call('GET', `/hosts/${w.host.id}/change-requests/count`, TEACHER);
    expect(r).toEqual({ status: 200, json: { pending: 1 } });
    expect(calls).toBe(0);
    expect((await api.call('GET', `/hosts/${w.host.id}/change-requests/count`, STUDENT)).status).toBe(403);
  });
});
