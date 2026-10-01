import { beforeEach, describe, expect, it } from 'vitest';
import { GoogleCalendarClient } from '../src/calendar/GoogleCalendarClient.js';
import { signState, verifyState } from '../src/security/signedState.js';
import { NOW, jst, setupWorld, type TestWorld } from './helpers.js';

const SECRET = 'test-secret-0123456789-0123456789-abcdef';

describe('Google 連携の state 署名', () => {
  it('正しい state は講師 ID を返し、改ざん・期限切れ・別の鍵・素の講師 ID は拒否する', () => {
    const state = signState(SECRET, 'host-1', NOW);
    expect(verifyState(SECRET, state, NOW)).toBe('host-1');
    const [body, sig] = state.split('.');
    const forgedBody = Buffer.from(JSON.stringify({ sub: 'victim', exp: 9_999_999_999, n: 'x' })).toString('base64url');
    expect(verifyState(SECRET, `${forgedBody}.${sig}`, NOW)).toBeNull();
    expect(verifyState(SECRET, `${body}.${sig}x`, NOW)).toBeNull();
    expect(verifyState(SECRET, state, new Date(NOW.getTime() + 11 * 60_000))).toBeNull();
    expect(verifyState('another-secret-0123456789-0123456789', state, NOW)).toBeNull();
    expect(verifyState(SECRET, 'host-1', NOW)).toBeNull();
  });

  it('認可 URL の state は署名付きで、callback は講師 ID をそのまま渡されても受け付けない', async () => {
    const store = { getRefreshToken: async () => null, saveRefreshToken: async () => {}, clear: async () => {} };
    const client = new GoogleCalendarClient(
      { clientId: 'cid', clientSecret: 'cs', redirectUri: 'http://localhost/google/callback', stateSecret: SECRET },
      store,
    );
    const url = new URL(client.authUrl('host-1', NOW));
    const state = url.searchParams.get('state')!;
    expect(state).not.toBe('host-1');
    expect(client.hostIdFromState(state, NOW)).toBe('host-1');
    // 以前は state=講師ID で他人の講師に連携を上書きできた
    await expect(client.handleCallback('victim-host-id', 'code', NOW)).rejects.toMatchObject({ code: 'forbidden' });
  });
});

describe('キャンセルフィーの消し込み', () => {
  let w: TestWorld;
  beforeEach(async () => {
    w = await setupWorld();
  });

  async function approvedFee() {
    const b = await w.bookings.createBooking({ hostId: w.host.id, student: w.student, startAt: jst('2026-10-06T10:00:00') });
    const r = await w.bookings.requestChange({ bookingId: b.id, student: w.student, kind: 'cancel', message: 'x', option: 'pay_cancellation_fee', feeMethod: 'in_person' });
    if (r.type !== 'pending_approval') throw new Error('unexpected');
    return (await w.bookings.decideRequest(r.request.id, w.host.id, 'approve')).booking;
  }

  it('講師が Stripe 連携を外していると、どのアカウントの決済でも支払済にしない', async () => {
    const booking = await approvedFee();
    expect((await w.repos.hosts.findById(w.host.id))?.stripeConnectAccountId).toBeNull();
    await expect(w.fees.apply({ type: 'fee_paid', bookingId: booking.id, accountId: 'acct_attacker' })).rejects.toMatchObject({ code: 'forbidden' });
    await expect(w.fees.apply({ type: 'fee_paid', bookingId: booking.id, accountId: '' })).rejects.toMatchObject({ code: 'forbidden' });
    expect((await w.repos.bookings.findById(booking.id))?.cancellationFeeStatus).toBe('pending');
  });

  it('フィーのない予約は、正しいアカウントの決済イベントでも支払済にしない', async () => {
    await w.fees.completeOnboardingForDev(w.host.id, 'acct_teacher');
    const b = await w.bookings.createBooking({ hostId: w.host.id, student: w.student, startAt: jst('2026-10-20T10:00:00') });
    await expect(w.fees.apply({ type: 'fee_paid', bookingId: b.id, accountId: 'acct_teacher' })).rejects.toMatchObject({ code: 'invalid_state' });
    expect((await w.repos.bookings.findById(b.id))?.cancellationFeeStatus).toBe('none');
  });

  it('未払いのキャンセルフィーがある生徒は退会できず、支払い後はできる', async () => {
    const booking = await approvedFee();
    await expect(w.accounts.deleteAccount({ email: w.student.email, subject: null, host: null })).rejects.toMatchObject({
      code: 'invalid_state',
      details: { unpaidFees: [booking.id] },
    });
    expect(await w.repos.bookings.findById(booking.id)).not.toBeNull();
    await w.bookings.markFeePaid(booking.id, w.host.id);
    expect((await w.accounts.deleteAccount({ email: w.student.email, subject: null, host: null })).deletedStudent).toBe(true);
  });
});
