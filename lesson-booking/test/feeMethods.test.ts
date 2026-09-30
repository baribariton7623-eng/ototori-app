import { beforeEach, describe, expect, it } from 'vitest';
import { availableFeeMethods } from '../src/domain/plans.js';
import { jst, setupWorld, type TestWorld } from './helpers.js';

let w: TestWorld;
beforeEach(async () => {
  w = await setupWorld();
});

// 呼び出しごとに 10/6 の別の時間枠を使う(同じ枠は二重予約になるため)
let slotHour = 10;
beforeEach(() => {
  slotHour = 10;
});
const nextSlot = () => jst(`2026-10-06T${String(slotHour++).padStart(2, '0')}:00:00`);
const BANK = 'みずほ銀行 渋谷支店 普通 1234567 コウシエー';

async function request(feeMethod?: 'card' | 'bank_transfer' | 'in_person') {
  const b = await w.bookings.createBooking({ hostId: w.host.id, student: w.student, startAt: nextSlot() });
  return {
    booking: b,
    run: () =>
      w.bookings.requestChange({ bookingId: b.id, student: w.student, kind: 'cancel', message: '急用のため', option: 'pay_cancellation_fee', feeMethod }),
  };
}

describe('キャンセルフィーの支払い方法', () => {
  it('選べる方法: カードは Stripe 連携時のみ、振込は振込先の入力時のみ、講師が外した方法は出ない', async () => {
    expect(availableFeeMethods(w.host)).toEqual(['in_person']);
    await w.repos.hosts.update(w.host.id, { bankTransferInfo: BANK });
    await w.fees.completeOnboardingForDev(w.host.id, 'acct_t');
    let host = (await w.repos.hosts.findById(w.host.id))!;
    expect(availableFeeMethods(host)).toEqual(['card', 'bank_transfer', 'in_person']);
    host = await w.repos.hosts.update(w.host.id, { feeMethods: ['bank_transfer'] });
    expect(availableFeeMethods(host)).toEqual(['bank_transfer']);
    // プランがフリーに落ちるとカードは選べない
    host = await w.repos.hosts.update(w.host.id, { feeMethods: ['card', 'in_person'], plan: 'free', subscriptionStatus: 'canceled' });
    expect(availableFeeMethods(host)).toEqual(['in_person']);
  });

  it('申請には支払い方法が必須で、講師が受け付けていない方法は選べない', async () => {
    const r1 = await request(undefined);
    await expect(r1.run()).rejects.toMatchObject({ code: 'validation', details: { field: 'feeMethod', allowed: ['in_person'] } });
    await expect((await request('bank_transfer')).run()).rejects.toMatchObject({ code: 'validation' });
    await expect((await request('card')).run()).rejects.toMatchObject({ code: 'validation' });
  });

  it('講師が支払い方法を 1 つも受け付けていなければ、フィー支払いでは申請できない', async () => {
    await w.repos.hosts.update(w.host.id, { feeMethods: [] });
    await expect((await request('in_person')).run()).rejects.toMatchObject({ code: 'validation', details: { field: 'feeMethod' } });
  });

  it('キャンセルフィーの支払いは日時変更の申請では選べない', async () => {
    const b = await w.bookings.createBooking({ hostId: w.host.id, student: w.student, startAt: nextSlot() });
    await expect(
      w.bookings.requestChange({
        bookingId: b.id,
        student: w.student,
        kind: 'reschedule',
        message: 'x',
        option: 'pay_cancellation_fee',
        feeMethod: 'in_person',
        proposedStartAt: jst('2026-10-08T10:00:00'),
      }),
    ).rejects.toMatchObject({ code: 'validation', details: { field: 'option' } });
  });

  it('講師の承認で方法が確定し、振込なら振込先つきの案内が生徒に届く', async () => {
    await w.repos.hosts.update(w.host.id, { bankTransferInfo: BANK });
    const r = await (await request('bank_transfer')).run();
    if (r.type !== 'pending_approval') throw new Error('unexpected');
    expect(r.request.feeMethod).toBe('bank_transfer');
    expect(w.mail.to('teacher@example.com').at(-1)?.text).toContain('キャンセルフィーを支払う(支払い方法: 銀行振込)');

    w.mail.clear();
    const { booking } = await w.bookings.decideRequest(r.request.id, w.host.id, 'approve');
    expect(booking).toMatchObject({ cancellationFeeStatus: 'pending', cancellationFeeMethod: 'bank_transfer', cancellationFeeAmount: 3000 });
    const mail = w.mail.to('student@example.com')[0];
    expect(mail?.text).toContain('お支払い方法: 銀行振込');
    expect(mail?.text).toContain(BANK);
  });

  it('却下すれば予約は残り、生徒は別の方法で申請し直せる', async () => {
    const { booking, run } = await request('in_person');
    const r = await run();
    if (r.type !== 'pending_approval') throw new Error('unexpected');
    await w.bookings.decideRequest(r.request.id, w.host.id, 'reject', '手渡しは受け付けていません。振込でお願いします');
    expect((await w.repos.bookings.findById(booking.id))?.status).toBe('confirmed');

    await w.repos.hosts.update(w.host.id, { bankTransferInfo: BANK });
    const again = await w.bookings.requestChange({
      bookingId: booking.id,
      student: w.student,
      kind: 'cancel',
      message: '振込で支払います',
      option: 'pay_cancellation_fee',
      feeMethod: 'bank_transfer',
    });
    expect(again.type).toBe('pending_approval');
  });

  it('承認後に講師が方法を変えると生徒に案内が届く。受け付けていない方法には変えられない', async () => {
    const r = await (await request('in_person')).run();
    if (r.type !== 'pending_approval') throw new Error('unexpected');
    const { booking } = await w.bookings.decideRequest(r.request.id, w.host.id, 'approve');

    await expect(w.bookings.changeFeeMethod(booking.id, w.host.id, 'bank_transfer')).rejects.toMatchObject({ code: 'validation' });
    await w.repos.hosts.update(w.host.id, { bankTransferInfo: BANK });
    w.mail.clear();
    const changed = await w.bookings.changeFeeMethod(booking.id, w.host.id, 'bank_transfer');
    expect(changed.cancellationFeeMethod).toBe('bank_transfer');
    expect(w.mail.to('student@example.com')[0]?.subject).toContain('【お支払い方法の変更】');
    expect(w.mail.to('student@example.com')[0]?.text).toContain(BANK);

    // 他の主催者・支払済みには変更できない
    await w.bookings.markFeePaid(booking.id, w.host.id);
    await expect(w.bookings.changeFeeMethod(booking.id, w.host.id, 'in_person')).rejects.toMatchObject({ code: 'invalid_state' });
  });

  it('カード以外で承認された予約には決済 URL を出さない', async () => {
    await w.fees.completeOnboardingForDev(w.host.id, 'acct_t');
    const r = await (await request('in_person')).run();
    if (r.type !== 'pending_approval') throw new Error('unexpected');
    const { booking } = await w.bookings.decideRequest(r.request.id, w.host.id, 'approve');
    await expect(
      w.fees.checkoutUrl(booking.id, w.student, { successUrl: 'https://x', cancelUrl: 'https://x' }),
    ).rejects.toMatchObject({ code: 'invalid_state' });
  });
});
