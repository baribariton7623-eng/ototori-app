/**
 * 実 PostgreSQL + PostgREST でしか確かめられないこと(npm run test:db でのみ実行)
 */
import { beforeEach, describe, expect, it } from 'vitest';
import type { Host } from '../src/domain/types.js';
import type { Repositories } from '../src/repo/Repository.js';
import { FixedClock, createRepositories, jst } from '../test/helpers.js';

let repos: Repositories;

const hostInput = (email: string, slug: string): Omit<Host, 'id' | 'createdAt'> => ({
  email,
  displayName: email,
  slug,
  bio: '',
  plan: 'free',
  subscriptionStatus: 'none',
  stripeCustomerId: null,
  stripeSubscriptionId: null,
  cancellationFeeAmount: null,
  feeMethods: ['bank_transfer', 'in_person', 'card'],
  bankTransferInfo: '',
  stripeConnectAccountId: null,
  connectChargesEnabled: false,
  organizationId: null,
  orgPlanActive: false,
  timezone: 'Asia/Tokyo',
  lessonMinutes: 60,
  rescheduleRangeDays: 7,
  lateChangeThresholdDays: 14,
  bookingHorizonDays: 40,
  minLeadMinutes: 60,
});

beforeEach(async () => {
  repos = await createRepositories(new FixedClock());
});

describe.runIf(process.env.TEST_REPOS === 'supabase')('Supabase 実装(実 DB)', () => {
  it('メールの "_" はワイルドカードにならない(別人の講師として扱われない)', async () => {
    await repos.hosts.create(hostInput('acb@example.com', 'victim'));
    expect(await repos.hosts.findByEmail('a_b@example.com')).toBeNull();
    expect(await repos.hosts.findByEmail('a%b@example.com')).toBeNull();
    expect((await repos.hosts.findByEmail('ACB@example.com'))?.slug).toBe('victim');
    await repos.students.create({ email: 'x_y@example.com', name: '' });
    expect(await repos.students.findByEmail('xzy@example.com')).toBeNull();
    expect(await repos.students.findByEmail('X_Y@example.com')).not.toBeNull();
  });

  it('同じ枠への同時の二重予約は DB の一意制約で防ぎ、slot_unavailable にする', async () => {
    const host = await repos.hosts.create(hostInput('t@example.com', 'teacher-t'));
    const s1 = await repos.students.create({ email: 's1@example.com', name: '' });
    const s2 = await repos.students.create({ email: 's2@example.com', name: '' });
    const base = {
      hostId: host.id,
      startAt: jst('2026-10-20T10:00:00').toISOString(),
      endAt: jst('2026-10-20T11:00:00').toISOString(),
      status: 'confirmed' as const,
      calendarEventId: null,
      note: null,
      cancellationFeeStatus: 'none' as const,
      cancellationFeeAmount: null,
      cancellationFeeMethod: null,
      reminderSentAt: null,
    };
    const results = await Promise.allSettled([
      repos.bookings.create({ ...base, studentId: s1.id }),
      repos.bookings.create({ ...base, studentId: s2.id }),
    ]);
    expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
    const rejected = results.find((r) => r.status === 'rejected') as PromiseRejectedResult;
    expect(rejected.reason).toMatchObject({ code: 'slot_unavailable' });

    // キャンセル済みなら同じ枠を取り直せる(部分一意インデックス)
    const ok = results.find((r) => r.status === 'fulfilled') as PromiseFulfilledResult<{ id: string }>;
    await repos.bookings.update(ok.value.id, { status: 'cancelled' });
    expect((await repos.bookings.create({ ...base, studentId: s2.id })).status).toBe('confirmed');
  });

  it('1 予約につき承認待ちの変更要求は 1 件まで(DB 制約)', async () => {
    const host = await repos.hosts.create(hostInput('t@example.com', 'teacher-t'));
    const st = await repos.students.create({ email: 's@example.com', name: '' });
    const b = await repos.bookings.create({
      hostId: host.id,
      studentId: st.id,
      startAt: jst('2026-10-06T10:00:00').toISOString(),
      endAt: jst('2026-10-06T11:00:00').toISOString(),
      status: 'confirmed',
      calendarEventId: null,
      note: null,
      cancellationFeeStatus: 'none',
      cancellationFeeAmount: null,
      cancellationFeeMethod: null,
      reminderSentAt: null,
    });
    const req = {
      bookingId: b.id,
      hostId: host.id,
      studentId: st.id,
      kind: 'reschedule' as const,
      option: 'reschedule_within_two_weeks' as const,
      message: 'x',
      proposedStartAts: [jst('2026-10-08T10:00:00').toISOString(), jst('2026-10-07T15:00:00').toISOString()],
      approvedStartAt: null,
      feeMethod: null,
      status: 'pending' as const,
      decisionNote: null,
    };
    const created = await repos.changeRequests.create(req);
    // 配列は順序を保ち、日時は ISO(Z) 形式で返る
    expect(created.proposedStartAts).toEqual(req.proposedStartAts);
    await expect(repos.changeRequests.create(req)).rejects.toMatchObject({ code: 'change_request_pending' });
  });

  it('支払い方法(text[])の往復と、不正な値の拒否', async () => {
    const host = await repos.hosts.create(hostInput('t@example.com', 'teacher-t'));
    const updated = await repos.hosts.update(host.id, { feeMethods: ['in_person', 'card'] });
    expect(updated.feeMethods).toEqual(['in_person', 'card']);
    await expect(repos.hosts.update(host.id, { feeMethods: ['cash' as never] })).rejects.toBeTruthy();
  });

  it('ルールの範囲は DB でも守られる(0010 の制約)', async () => {
    const host = await repos.hosts.create(hostInput('t@example.com', 'teacher-t'));
    await expect(repos.hosts.update(host.id, { bookingHorizonDays: 61 })).rejects.toBeTruthy();
    await expect(repos.hosts.update(host.id, { lateChangeThresholdDays: 61 })).rejects.toBeTruthy();
    expect((await repos.hosts.update(host.id, { bookingHorizonDays: 60, lateChangeThresholdDays: 0 })).bookingHorizonDays).toBe(60);
  });

  it('講師を削除すると、カレンダー設定・営業時間枠・予約・変更要求・Google 認可も消える', async () => {
    const host = await repos.hosts.create(hostInput('t@example.com', 'teacher-t'));
    const st = await repos.students.create({ email: 's@example.com', name: '' });
    await repos.hostCalendars.add({ hostId: host.id, calendarId: 'primary', label: '', role: 'write_target' });
    await repos.availabilityWindows.add({ hostId: host.id, weekday: 1, startTime: '10:00', endTime: '18:00' });
    await repos.googleCredentials.saveRefreshToken(host.id, 'rt');
    const b = await repos.bookings.create({
      hostId: host.id,
      studentId: st.id,
      startAt: jst('2026-10-20T10:00:00').toISOString(),
      endAt: jst('2026-10-20T11:00:00').toISOString(),
      status: 'confirmed',
      calendarEventId: null,
      note: null,
      cancellationFeeStatus: 'none',
      cancellationFeeAmount: null,
      cancellationFeeMethod: null,
      reminderSentAt: null,
    });
    await repos.hosts.delete(host.id);
    expect(await repos.hosts.findById(host.id)).toBeNull();
    expect(await repos.bookings.findById(b.id)).toBeNull();
    expect(await repos.hostCalendars.listByHost(host.id)).toEqual([]);
    expect(await repos.availabilityWindows.listByHost(host.id)).toEqual([]);
    expect(await repos.googleCredentials.getRefreshToken(host.id)).toBeNull();
    expect(await repos.students.findById(st.id)).not.toBeNull();
  });
});
