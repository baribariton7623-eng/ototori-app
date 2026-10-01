import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { CalendarClient } from '../src/calendar/CalendarClient.js';
import { devUser, jst, setupWorld, startApi, type TestApi, type TestWorld } from './helpers.js';

const TEACHER = devUser('teacher@example.com', '講師A');
const STUDENT = devUser('student@example.com', '生徒B');

let w: TestWorld;
beforeEach(async () => {
  w = await setupWorld();
});

/** カレンダーの操作を 1 つ失敗させる。戻り値を呼ぶと元に戻る */
function breakCalendar(method: 'createEvent' | 'updateEvent' | 'deleteEvent'): () => void {
  const original = w.calendar[method].bind(w.calendar) as CalendarClient[typeof method];
  (w.calendar as unknown as Record<string, unknown>)[method] = async () => {
    throw new Error('Google API down');
  };
  return () => {
    (w.calendar as unknown as Record<string, unknown>)[method] = original;
  };
}

const syncMails = () => w.mail.to('teacher@example.com').filter((m) => m.subject.startsWith('【カレンダー未反映】'));
const book = (start: string) => w.bookings.createBooking({ hostId: w.host.id, student: w.student, startAt: jst(start) });

describe('カレンダーへの反映に失敗したとき', () => {
  it('予約時: 予約は成立し、講師に 1 回だけ知らせ、定期実行で登録し直す', async () => {
    const restore = breakCalendar('createEvent');
    const b = await book('2026-10-20T10:00:00');
    expect(b.status).toBe('confirmed');
    expect(b.calendarEventId).toBeNull();
    expect(b.calendarSyncError).toContain('Google API down');
    expect(w.mail.to('student@example.com').length).toBeGreaterThan(0);
    expect(syncMails()).toHaveLength(1);
    expect(syncMails()[0]?.subject).toContain('予約をカレンダーに登録できませんでした');

    // 失敗が続いても通知は増えない
    expect(await w.bookings.retryPendingCalendarSyncs()).toEqual({ checked: 1, fixed: 0 });
    expect(syncMails()).toHaveLength(1);

    restore();
    expect(await w.bookings.retryPendingCalendarSyncs()).toEqual({ checked: 1, fixed: 1 });
    const fixed = await w.repos.bookings.findById(b.id);
    expect(fixed?.calendarSyncError).toBeNull();
    expect(fixed?.calendarEventId).not.toBeNull();
    expect(w.calendar.listEvents().map((e) => e.startAt)).toEqual([b.startAt]);
  });

  it('振替時: 日時は変わり、講師に知らせ、再試行でカレンダーの日時を合わせる', async () => {
    const b = await book('2026-10-20T10:00:00');
    const restore = breakCalendar('updateEvent');
    const out = await w.bookings.requestChange({ bookingId: b.id, student: w.student, kind: 'reschedule', proposedStartAts: [jst('2026-10-21T11:00:00')] });
    expect(out.booking.startAt).toBe(jst('2026-10-21T11:00:00').toISOString());
    expect(out.booking.calendarSyncError).not.toBeNull();
    expect(syncMails()[0]?.subject).toContain('振替後の日時');

    restore();
    const fixed = await w.bookings.retryCalendarSync(b.id, w.host.id);
    expect(fixed.calendarSyncError).toBeNull();
    expect(w.calendar.listEvents()[0]?.startAt).toBe(jst('2026-10-21T11:00:00').toISOString());
  });

  it('生徒のキャンセル: 削除に失敗してもキャンセルは成立し(以前はエラー)、再試行で予定を消す', async () => {
    const b = await book('2026-10-20T10:00:00');
    const restore = breakCalendar('deleteEvent');
    const out = await w.bookings.requestChange({ bookingId: b.id, student: w.student, kind: 'cancel' });
    expect(out.booking.status).toBe('cancelled');
    expect(out.booking.calendarEventId).not.toBeNull();
    expect(out.booking.calendarSyncError).not.toBeNull();
    expect(syncMails()[0]?.subject).toContain('削除できませんでした');
    expect(w.calendar.listEvents()).toHaveLength(1);

    restore();
    expect(await w.bookings.retryPendingCalendarSyncs()).toEqual({ checked: 1, fixed: 1 });
    const fixed = await w.repos.bookings.findById(b.id);
    expect(fixed).toMatchObject({ calendarEventId: null, calendarSyncError: null });
    expect(w.calendar.listEvents()).toHaveLength(0);
  });

  it('講師の退会では、削除に失敗しても講師には知らせない', async () => {
    await book('2026-10-20T10:00:00');
    breakCalendar('deleteEvent');
    const [cancelled] = await w.bookings.cancelAllFutureByHost(w.host.id, '退会のため');
    expect(cancelled?.status).toBe('cancelled');
    expect(syncMails()).toHaveLength(0);
  });

  it('フリープランは書き込まないので、失敗扱いにもしない', async () => {
    await w.repos.hosts.update(w.host.id, { plan: 'free', subscriptionStatus: 'none' });
    breakCalendar('createEvent');
    const b = await book('2026-10-20T10:00:00');
    expect(b).toMatchObject({ calendarEventId: null, calendarSyncError: null });
    expect(syncMails()).toHaveLength(0);
  });
});

describe('元の時間と重なる振替', () => {
  beforeEach(async () => {
    // 火曜に 10:30 始まりの枠も作る(10:00 の予約を 10:30 に動かせるか確かめる)
    await w.repos.availabilityWindows.add({ hostId: w.host.id, weekday: 2, startTime: '10:30', endTime: '11:30' });
  });

  it('自分の予約がカレンダーに書いた予定は、振替先の判定で埋まっている扱いにしない', async () => {
    const b = await book('2026-10-20T10:00:00');
    expect(b.calendarEventId).not.toBeNull();
    const out = await w.bookings.requestChange({ bookingId: b.id, student: w.student, kind: 'reschedule', proposedStartAts: [jst('2026-10-20T10:30:00')] });
    expect(out.booking.startAt).toBe(jst('2026-10-20T10:30:00').toISOString());
    expect(w.calendar.listEvents()[0]?.startAt).toBe(jst('2026-10-20T10:30:00').toISOString());
  });

  it('他の予定と重なる時間には振り替えられない', async () => {
    const b = await book('2026-10-20T10:00:00');
    w.calendar.seedBusy('private@group.calendar.google.com', [
      { startAt: jst('2026-10-20T11:00:00').toISOString(), endAt: jst('2026-10-20T11:15:00').toISOString() },
    ]);
    await expect(
      w.bookings.requestChange({ bookingId: b.id, student: w.student, kind: 'reschedule', proposedStartAts: [jst('2026-10-20T10:30:00')] }),
    ).rejects.toMatchObject({ code: 'slot_unavailable' });
  });
});

describe('HTTP', () => {
  let api: TestApi;
  beforeEach(async () => {
    await w.repos.availabilityWindows.add({ hostId: w.host.id, weekday: 2, startTime: '10:30', endTime: '11:30' });
    api = await startApi(w);
  });
  afterEach(() => api.close());

  it('振替先の候補には、公開の空き枠と違い自分の予約と重なる時間も出る', async () => {
    const b = await book('2026-10-20T10:00:00');
    const q = `from=${encodeURIComponent(jst('2026-10-20T00:00:00').toISOString())}&to=${encodeURIComponent(jst('2026-10-20T23:59:00').toISOString())}`;
    const t1030 = jst('2026-10-20T10:30:00').toISOString();
    const pub = await api.call('GET', `/hosts/${w.host.id}/slots?${q}`, {});
    expect(pub.json.slots.map((s: { startAt: string }) => s.startAt)).not.toContain(t1030);
    const mine = await api.call('GET', `/bookings/${b.id}/slots?${q}`, STUDENT);
    expect(mine.status).toBe(200);
    expect(mine.json.slots.map((s: { startAt: string }) => s.startAt)).toContain(t1030);
    expect((await api.call('GET', `/bookings/${b.id}/slots?${q}`, devUser('other@example.com', '他人'))).status).toBe(403);
  });

  it('講師は予約一覧から再試行でき、定期実行の応答に再試行の結果が入る', async () => {
    const restore = breakCalendar('createEvent');
    const b = await book('2026-10-20T10:00:00');
    const list = await api.call('GET', `/hosts/${w.host.id}/bookings`, TEACHER);
    expect(list.json.find((x: { id: string }) => x.id === b.id).calendarSyncError).toContain('Google API down');

    const still = await api.call('POST', `/hosts/${w.host.id}/bookings/${b.id}/calendar-sync`, TEACHER);
    expect(still.json.calendarSyncError).not.toBeNull();
    restore();
    const ok = await api.call('POST', `/hosts/${w.host.id}/bookings/${b.id}/calendar-sync`, TEACHER);
    expect(ok.json).toMatchObject({ calendarSyncError: null });
    expect((await api.call('POST', `/hosts/${w.host.id}/bookings/${b.id}/calendar-sync`, STUDENT)).status).toBe(403);

    const cron = await api.call('POST', '/internal/cron/reminders', { 'x-cron-secret': 'cron-test-secret' });
    expect(cron.json.calendarSync).toEqual({ checked: 0, fixed: 0 });
  });
});
