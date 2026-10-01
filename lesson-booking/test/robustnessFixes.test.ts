import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { Booking } from '../src/domain/types.js';
import { devUser, insertBooking as insertBookingFor, jst, setupWorld, startApi, type TestApi, type TestWorld } from './helpers.js';

const TEACHER = devUser('teacher@example.com', '講師A');
const NEWCOMER = devUser('newcomer@example.com', '新講師');

let w: TestWorld;

beforeEach(async () => {
  w = await setupWorld();
});

function insertBooking(startAt: Date): Promise<Booking> {
  return insertBookingFor(w, startAt);
}

describe('HTTP: ルートの衝突と入力検証', () => {
  let api: TestApi;
  beforeEach(async () => {
    api = await startApi(w);
  });
  afterEach(() => api.close());
  const call: TestApi['call'] = (...args) => api.call(...args);

  it('講師用ルートと同じ名前の URL 名(billing など)でも公開ページを未ログインで開ける', async () => {
    for (const slug of ['billing', 'connect', 'bookings', 'calendars']) {
      await w.repos.hosts.update(w.host.id, { slug });
      const r = await call('GET', `/hosts/by-slug/${slug}`, {});
      expect(r.status, slug).toBe(200);
      expect(r.json.id ?? r.json.host?.id).toBe(w.host.id);
    }
  });

  it('不正なタイムゾーンは登録・更新とも 400 にする', async () => {
    const created = await call('POST', '/hosts', NEWCOMER, { displayName: '新講師', timezone: 'Mars/Olympus' });
    expect(created.status).toBe(400);
    const patched = await call('PATCH', `/hosts/${w.host.id}`, TEACHER, { timezone: 'Asia/Tokyoo' });
    expect(patched.status).toBe(400);
    const ok = await call('PATCH', `/hosts/${w.host.id}`, TEACHER, { timezone: 'Europe/Berlin' });
    expect(ok.status).toBe(200);
  });
});

describe('カレンダー書き込みの失敗', () => {
  it('イベント作成に失敗しても予約は確定し、確認メールも届く', async () => {
    w.calendar.createEvent = async () => {
      throw new Error('Google API down');
    };
    const booking = await w.bookings.createBooking({ hostId: w.host.id, student: w.student, startAt: jst('2026-10-20T10:00:00') });
    expect(booking.status).toBe('confirmed');
    expect(booking.calendarEventId).toBeNull();
    expect((await w.repos.bookings.findById(booking.id))?.status).toBe('confirmed');
    expect(w.mail.sent.some((m) => m.to === w.student.email)).toBe(true);
  });

  it('振替でイベント更新に失敗しても、予約の日時は変更される', async () => {
    const booking = await w.bookings.createBooking({ hostId: w.host.id, student: w.student, startAt: jst('2026-10-29T10:00:00') });
    expect(booking.calendarEventId).not.toBeNull();
    w.calendar.updateEvent = async () => {
      throw new Error('Google API down');
    };
    const out = await w.bookings.requestChange({
      bookingId: booking.id,
      student: w.student,
      kind: 'reschedule',
      proposedStartAts: [jst('2026-10-30T11:00:00')],
    });
    expect(out.type).toBe('applied');
    expect((await w.repos.bookings.findById(booking.id))?.startAt).toBe(jst('2026-10-30T11:00:00').toISOString());
  });
});

describe('振替と月間上限(フリープラン)', () => {
  it('上限に達した別の月へは振替できず、元の予約は変わらない', async () => {
    await w.repos.hosts.update(w.host.id, { plan: 'free', subscriptionStatus: 'none' });
    const booking = await w.bookings.createBooking({ hostId: w.host.id, student: w.student, startAt: jst('2026-10-29T10:00:00') });
    // 11月に上限(10件)まで入れる
    const days = ['02', '03', '04', '05', '06'];
    for (const d of days) {
      await insertBooking(jst(`2026-11-${d}T10:00:00`));
      await insertBooking(jst(`2026-11-${d}T12:00:00`));
    }
    await expect(
      w.bookings.requestChange({ bookingId: booking.id, student: w.student, kind: 'reschedule', proposedStartAts: [jst('2026-11-06T15:00:00')] }),
    ).rejects.toMatchObject({ code: 'plan_limit' });
    expect((await w.repos.bookings.findById(booking.id))?.startAt).toBe(booking.startAt);

    // 同じ月の中での振替は件数が増えないので許可する
    const out = await w.bookings.requestChange({
      bookingId: booking.id,
      student: w.student,
      kind: 'reschedule',
      proposedStartAts: [jst('2026-10-30T15:00:00')],
    });
    expect(out.type).toBe('applied');
  });
});

describe('同じ講師の予約の重なり', () => {
  it('確定済みの予約と時間が重なる予約は保存できない', async () => {
    const first = await insertBooking(jst('2026-10-20T10:00:00'));
    await expect(insertBooking(jst('2026-10-20T10:30:00'))).rejects.toMatchObject({ code: 'slot_unavailable' });
    // 終了時刻ちょうどから始まる予約は重ならない
    const next = await insertBooking(jst('2026-10-20T11:00:00'));
    // 既存予約を重なる時間へ動かす更新も拒否する
    await expect(
      w.repos.bookings.update(next.id, { startAt: jst('2026-10-20T10:15:00').toISOString(), endAt: jst('2026-10-20T11:15:00').toISOString() }),
    ).rejects.toMatchObject({ code: 'slot_unavailable' });
    // キャンセル済みの枠には入れられる
    await w.repos.bookings.update(first.id, { status: 'cancelled' });
    await expect(insertBooking(jst('2026-10-20T10:00:00'))).resolves.toMatchObject({ status: 'confirmed' });
  });
});
