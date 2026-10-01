import type { Host, Organization } from '../shared/types.js';
import type { BillingEvent, BillingProvider } from './BillingProvider.js';

/**
 * Stripe を使わないローカル用。
 * checkout URL はアプリ内の `/billing/fake/activate` を指し、開くと即座に契約が有効になる。
 * Webhook は JSON をそのまま BillingEvent として受け取る(署名検証なし)。
 */
export class FakeBillingProvider implements BillingProvider {
  constructor(private readonly apiBaseUrl: string) {}

  async createCheckoutUrl(host: Host, urls: { success: string }): Promise<string> {
    const q = new URLSearchParams({ hostId: host.id, redirect: urls.success });
    return `${this.apiBaseUrl}/billing/fake/activate?${q.toString()}`;
  }

  async createPortalUrl(host: Host, returnUrl: string): Promise<string> {
    const q = new URLSearchParams({ hostId: host.id, redirect: returnUrl });
    return `${this.apiBaseUrl}/billing/fake/cancel?${q.toString()}`;
  }

  readonly canceled: string[] = [];
  readonly seatUpdates: { orgId: string; seats: number }[] = [];
  readonly canceledOrgs: string[] = [];

  async createOrgCheckoutUrl(org: Organization, _owner: Host, seats: number, urls: { success: string }): Promise<string> {
    const q = new URLSearchParams({ orgId: org.id, seats: String(seats), redirect: urls.success });
    return `${this.apiBaseUrl}/billing/fake/org-activate?${q.toString()}`;
  }

  async createOrgPortalUrl(org: Organization, returnUrl: string): Promise<string> {
    const q = new URLSearchParams({ orgId: org.id, redirect: returnUrl });
    return `${this.apiBaseUrl}/billing/fake/org-cancel?${q.toString()}`;
  }

  async updateOrgSeats(org: Organization, seats: number): Promise<void> {
    this.seatUpdates.push({ orgId: org.id, seats });
  }

  async cancelOrgImmediately(org: Organization): Promise<void> {
    this.canceledOrgs.push(org.id);
  }

  async cancelImmediately(host: Host): Promise<void> {
    this.canceled.push(host.id);
  }

  async parseWebhook(rawBody: Buffer): Promise<BillingEvent> {
    return JSON.parse(rawBody.toString('utf8')) as BillingEvent;
  }
}
