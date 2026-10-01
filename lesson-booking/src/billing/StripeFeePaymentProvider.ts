import Stripe from 'stripe';
import { DomainError } from '../domain/errors.js';
import type { Booking, Host, Student } from '../shared/types.js';
import type { ConnectEvent, FeePaymentProvider } from './FeePaymentProvider.js';

/**
 * Stripe Connect(Standard アカウント)+ Direct charge。
 * 決済は講師のアカウント上で行われ(stripeAccount オプション)、運営者は手数料を取らない。
 * Connect 用 Webhook は、Stripe ダッシュボードで「連結アカウントのイベント」を受け取るエンドポイントとして
 * 通常の Webhook とは別に登録し、その署名シークレットを使う。
 */
export class StripeFeePaymentProvider implements FeePaymentProvider {
  private readonly stripe: Stripe;

  constructor(
    secretKey: string,
    private readonly connectWebhookSecret: string,
  ) {
    this.stripe = new Stripe(secretKey);
  }

  async createOnboardingUrl(host: Host, urls: { refreshUrl: string; returnUrl: string }): Promise<{ url: string; accountId: string }> {
    let accountId = host.stripeConnectAccountId;
    if (!accountId) {
      const account = await this.stripe.accounts.create({
        type: 'standard',
        country: 'JP',
        email: host.email,
        metadata: { hostId: host.id },
      });
      accountId = account.id;
    }
    const link = await this.stripe.accountLinks.create({
      account: accountId,
      refresh_url: urls.refreshUrl,
      return_url: urls.returnUrl,
      type: 'account_onboarding',
    });
    return { url: link.url, accountId };
  }

  async fetchChargesEnabled(accountId: string): Promise<boolean> {
    const account = await this.stripe.accounts.retrieve(accountId);
    return account.charges_enabled === true;
  }

  async createFeeCheckoutUrl(
    host: Host,
    booking: Booking,
    student: Student,
    amount: number,
    urls: { successUrl: string; cancelUrl: string },
  ): Promise<string> {
    if (!host.stripeConnectAccountId) throw new DomainError('invalid_state', '講師の Stripe アカウントが未連携です');
    const metadata = { kind: 'cancellation_fee', bookingId: booking.id, hostId: host.id };
    const session = await this.stripe.checkout.sessions.create(
      {
        mode: 'payment',
        customer_email: student.email,
        line_items: [
          {
            quantity: 1,
            price_data: {
              currency: 'jpy',
              unit_amount: amount, // JPY はゼロ小数通貨なので円単位
              product_data: { name: `キャンセルフィー(${host.displayName})` },
            },
          },
        ],
        success_url: urls.successUrl,
        cancel_url: urls.cancelUrl,
        metadata,
        payment_intent_data: { metadata },
      },
      { stripeAccount: host.stripeConnectAccountId, idempotencyKey: `fee-${booking.id}-${amount}` },
    );
    if (!session.url) throw new DomainError('validation', '決済ページの URL を取得できませんでした');
    return session.url;
  }

  async parseConnectWebhook(rawBody: Buffer, signature: string | undefined): Promise<ConnectEvent> {
    if (!signature) throw new DomainError('forbidden', 'Stripe 署名がありません');
    let event: Stripe.Event;
    try {
      event = this.stripe.webhooks.constructEvent(rawBody, signature, this.connectWebhookSecret);
    } catch (e) {
      throw new DomainError('forbidden', `Stripe 署名の検証に失敗しました: ${e instanceof Error ? e.message : String(e)}`);
    }
    const accountId = event.account ?? '';
    switch (event.type) {
      case 'checkout.session.completed':
      case 'checkout.session.async_payment_succeeded': {
        const s = event.data.object;
        if (s.metadata?.kind !== 'cancellation_fee' || !s.metadata.bookingId) return { type: 'ignored', raw: event.type };
        if (s.payment_status !== 'paid') return { type: 'ignored', raw: `${event.type}:${s.payment_status}` };
        return { type: 'fee_paid', bookingId: s.metadata.bookingId, accountId };
      }
      case 'account.updated': {
        const a = event.data.object;
        return { type: 'account_updated', accountId: a.id, chargesEnabled: a.charges_enabled === true };
      }
      default:
        return { type: 'ignored', raw: event.type };
    }
  }
}
