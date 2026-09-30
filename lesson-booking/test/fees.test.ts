import { beforeEach, describe, expect, it } from 'vitest';
import { canCollectFeeOnline } from '../src/domain/plans.js';
import { jst, setupWorld, type TestWorld } from './helpers.js';

let w: TestWorld;
beforeEach(async () => {
  w = await setupWorld();
});

const NEAR = jst('2026-10-06T10:00:00');
const urls = { successUrl: 'https://app.example.com/#/mine', cancelUrl: 'https://app.example.com/#/mine' };

async function approvedFeeBooking(world: TestWorld) {
  const b = await world.bookings.createBooking({ hostId: world.host.id, student: world.student, startAt: NEAR });
  const r = await world.bookings.requestChange({ bookingId: b.id, student: world.student, kind: 'cancel', message: '急用', option: 'pay_cancellation_fee' });
  if (r.type !== 'pending_approval') throw new Error('unexpected');
  const { booking } = await world.bookings.decideRequest(r.request.id, world.host.id, 'approve');
  return booking;
}

describe('キャンセルフィーのオンライン決済', () => {
  it('承認時点の金額が予約に記録され、後で講師が金額を変えても変わらない', async () => {
    const booking = await approvedFeeBooking(w);
    expect(booking.cancellationFeeStatus).toBe('pending');
    expect(booking.cancellationFeeAmount).toBe(3000);
    await w.repos.hosts.update(w.host.id, { cancellationFeeAmount: 5000 });
    expect((await w.repos.bookings.findById(booking.id))?.cancellationFeeAmount).toBe(3000);
  });

  it('講師が Stripe 未連携なら生徒はオンラインで払えない', async () => {
    const booking = await approvedFeeBooking(w);
    await expect(w.fees.checkoutUrl(booking.id, w.student, urls)).rejects.toMatchObject({ code: 'invalid_state' });
  });

  it('フリープランでは連携を始められない', async () => {
    await w.repos.hosts.update(w.host.id, { plan: 'free', subscriptionStatus: 'none' });
    const host = (await w.repos.hosts.findById(w.host.id))!;
    await expect(w.fees.startOnboarding(host, { refreshUrl: 'https://x', returnUrl: 'https://x' })).rejects.toMatchObject({
      code: 'plan_limit',
    });
  });

  it('連携後は決済 URL を発行でき、決済完了で paid になり講師と生徒に通知', async () => {
    const url = await w.fees.startOnboarding(w.host, { refreshUrl: 'https://x', returnUrl: 'https://x' });
    expect(url).toContain('/billing/fake/connect-onboard');
    const accountId = (await w.repos.hosts.findById(w.host.id))!.stripeConnectAccountId!;
    await w.fees.completeOnboardingForDev(w.host.id, accountId);
    expect(canCollectFeeOnline((await w.repos.hosts.findById(w.host.id))!)).toBe(true);

    const booking = await approvedFeeBooking(w);
    const checkout = await w.fees.checkoutUrl(booking.id, w.student, urls);
    expect(checkout).toContain(`bookingId=${booking.id}`);

    w.mail.clear();
    await w.fees.apply({ type: 'fee_paid', bookingId: booking.id, accountId });
    expect((await w.repos.bookings.findById(booking.id))?.cancellationFeeStatus).toBe('paid');
    expect(w.mail.to('teacher@example.com')[0]?.subject).toBe('【キャンセルフィー入金】生徒B 3,000円');
    expect(w.mail.to('student@example.com')[0]?.subject).toBe('【お支払い完了】キャンセルフィー 3,000円');

    // Webhook の再送は冪等
    w.mail.clear();
    await w.fees.apply({ type: 'fee_paid', bookingId: booking.id, accountId });
    expect(w.mail.sent).toHaveLength(0);
    // 支払済みには決済 URL を出さない
    await expect(w.fees.checkoutUrl(booking.id, w.student, urls)).rejects.toMatchObject({ code: 'invalid_state' });
  });

  it('別の講師アカウントからの決済イベントでは消し込まない', async () => {
    await w.fees.completeOnboardingForDev(w.host.id, 'acct_teacher');
    const booking = await approvedFeeBooking(w);
    await expect(w.fees.apply({ type: 'fee_paid', bookingId: booking.id, accountId: 'acct_other' })).rejects.toMatchObject({
      code: 'forbidden',
    });
    expect((await w.repos.bookings.findById(booking.id))?.cancellationFeeStatus).toBe('pending');
  });

  it('他の生徒は決済 URL を取れない。account.updated で決済可否が変わる', async () => {
    await w.fees.completeOnboardingForDev(w.host.id, 'acct_teacher');
    const booking = await approvedFeeBooking(w);
    const other = await w.repos.students.create({ email: 'o@example.com', name: 'O' });
    await expect(w.fees.checkoutUrl(booking.id, other, urls)).rejects.toMatchObject({ code: 'forbidden' });

    await w.fees.apply({ type: 'account_updated', accountId: 'acct_teacher', chargesEnabled: false });
    expect((await w.repos.hosts.findById(w.host.id))?.connectChargesEnabled).toBe(false);
    await expect(w.fees.checkoutUrl(booking.id, w.student, urls)).rejects.toMatchObject({ code: 'invalid_state' });
  });

  it('連携済みなら承認メールにオンライン決済の案内が入る', async () => {
    await w.fees.completeOnboardingForDev(w.host.id, 'acct_teacher');
    w.mail.clear();
    await approvedFeeBooking(w);
    const approved = w.mail.to('student@example.com').find((m) => m.subject.includes('承認されました'));
    expect(approved?.text).toContain('キャンセルフィー: 3,000円');
    expect(approved?.text).toContain('マイ予約からクレジットカードでお支払いいただけます');
  });
});
