import type { Booking, Host, Student } from '../shared/types.js';
import type { ConnectEvent, FeePaymentProvider } from './FeePaymentProvider.js';

/**
 * ローカル用。オンボーディングと決済はアプリ内の /billing/fake/... に飛ばして即完了させる。
 */
export class FakeFeePaymentProvider implements FeePaymentProvider {
  constructor(private readonly apiBaseUrl: string) {}

  async createOnboardingUrl(host: Host, urls: { returnUrl: string }): Promise<{ url: string; accountId: string }> {
    const accountId = host.stripeConnectAccountId ?? `acct_fake_${host.id.slice(0, 8)}`;
    const q = new URLSearchParams({ hostId: host.id, accountId, redirect: urls.returnUrl });
    return { url: `${this.apiBaseUrl}/billing/fake/connect-onboard?${q.toString()}`, accountId };
  }

  async fetchChargesEnabled(): Promise<boolean> {
    return true;
  }

  async createFeeCheckoutUrl(
    _host: Host,
    booking: Booking,
    _student: Student,
    _amount: number,
    urls: { successUrl: string },
  ): Promise<string> {
    const q = new URLSearchParams({ bookingId: booking.id, redirect: urls.successUrl });
    return `${this.apiBaseUrl}/billing/fake/fee-paid?${q.toString()}`;
  }

  async parseConnectWebhook(rawBody: Buffer): Promise<ConnectEvent> {
    return JSON.parse(rawBody.toString('utf8')) as ConnectEvent;
  }
}
