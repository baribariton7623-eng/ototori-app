import { beforeEach, describe, expect, it } from 'vitest';
import { FakeBillingProvider } from '../src/billing/FakeBillingProvider.js';
import { PLAN_LIMITS, effectivePlan, limitsFor } from '../src/domain/plans.js';
import { monthRange } from '../src/domain/time.js';
import { BillingService } from '../src/services/BillingService.js';
import { jst, setupWorld, type TestWorld } from './helpers.js';

describe('プラン判定', () => {
  it('pro でも支払いが止まっていれば free 扱い', () => {
    expect(effectivePlan({ plan: 'pro', subscriptionStatus: 'active' })).toBe('pro');
    expect(effectivePlan({ plan: 'pro', subscriptionStatus: 'past_due' })).toBe('free');
    expect(effectivePlan({ plan: 'pro', subscriptionStatus: 'canceled' })).toBe('free');
    expect(effectivePlan({ plan: 'free', subscriptionStatus: 'none' })).toBe('free');
    expect(limitsFor({ plan: 'free', subscriptionStatus: 'none' })).toEqual(PLAN_LIMITS.free);
  });
  it('monthRange は主催者タイムゾーンの暦月', () => {
    const { from, to } = monthRange(jst('2026-10-31T23:30:00'), 'Asia/Tokyo');
    expect(from.toISOString()).toBe(jst('2026-10-01T00:00:00').toISOString());
    expect(to.toISOString()).toBe(jst('2026-11-01T00:00:00').toISOString());
    const dec = monthRange(jst('2026-12-15T12:00:00'), 'Asia/Tokyo');
    expect(dec.to.toISOString()).toBe(jst('2027-01-01T00:00:00').toISOString());
  });
});

describe('フリープランの上限', () => {
  let w: TestWorld;
  beforeEach(async () => {
    w = await setupWorld();
    await w.repos.hosts.update(w.host.id, { plan: 'free', subscriptionStatus: 'none' });
  });

  it('月間予約数の上限に達すると予約できない(翌月は別枠)', async () => {
    const limit = PLAN_LIMITS.free.maxBookingsPerMonth as number;
    // 10月の平日 10:00 を limit 件予約
    const days = ['05', '06', '07', '08', '09', '12', '13', '14', '15', '16', '19', '20'];
    for (let i = 0; i < limit; i++) {
      await w.bookings.createBooking({ hostId: w.host.id, student: w.student, startAt: jst(`2026-10-${days[i]}T10:00:00`) });
    }
    await expect(
      w.bookings.createBooking({ hostId: w.host.id, student: w.student, startAt: jst(`2026-10-${days[limit]}T10:00:00`) }),
    ).rejects.toMatchObject({ code: 'plan_limit' });
    // 11月は予約できる(40日以内)
    const nov = await w.bookings.createBooking({ hostId: w.host.id, student: w.student, startAt: jst('2026-11-02T10:00:00') });
    expect(nov.status).toBe('confirmed');
  });

  it('フリープランではカレンダーにイベントを書かない', async () => {
    const b = await w.bookings.createBooking({ hostId: w.host.id, student: w.student, startAt: jst('2026-10-20T10:00:00') });
    expect(b.calendarEventId).toBeNull();
    expect(w.calendar.listEvents()).toHaveLength(0);
  });

  it('プロに切り替えると上限がなくなり、カレンダー書き込みも有効になる', async () => {
    const billing = new BillingService(w.repos, new FakeBillingProvider('http://localhost'));
    const host = await billing.activateForDev(w.host.id);
    expect(host.plan).toBe('pro');
    expect(host.subscriptionStatus).toBe('active');
    const b = await w.bookings.createBooking({ hostId: w.host.id, student: w.student, startAt: jst('2026-10-20T10:00:00') });
    expect(b.calendarEventId).not.toBeNull();

    const canceled = await billing.cancelForDev(w.host.id);
    expect(canceled.plan).toBe('free');
    expect(canceled.subscriptionStatus).toBe('canceled');
  });

  it('Webhook: 支払い遅延で free 相当に落ち、復旧で pro に戻る', async () => {
    const billing = new BillingService(w.repos, new FakeBillingProvider('http://localhost'));
    await billing.activateForDev(w.host.id);
    const cus = (await w.repos.hosts.findById(w.host.id))!.stripeCustomerId!;
    await billing.apply({ type: 'subscription_updated', customerId: cus, subscriptionId: 'sub_1', status: 'past_due' });
    expect(effectivePlan((await w.repos.hosts.findById(w.host.id))!)).toBe('free');
    await billing.apply({ type: 'subscription_updated', customerId: cus, subscriptionId: 'sub_1', status: 'active' });
    expect(effectivePlan((await w.repos.hosts.findById(w.host.id))!)).toBe('pro');
    // 知らない顧客のイベントは無視
    await billing.apply({ type: 'subscription_canceled', customerId: 'cus_unknown', subscriptionId: 'x' });
    expect(effectivePlan((await w.repos.hosts.findById(w.host.id))!)).toBe('pro');
  });
});
