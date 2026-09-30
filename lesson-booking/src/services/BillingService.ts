import type { BillingEvent, BillingProvider } from '../billing/BillingProvider.js';
import { DomainError } from '../domain/errors.js';
import type { Host, Organization, SubscriptionStatus } from '../domain/types.js';
import type { Repositories } from '../repo/Repository.js';

/** 課金イベントを主催者のプラン状態に反映する */
export class BillingService {
  constructor(
    private readonly repos: Repositories,
    private readonly provider: BillingProvider,
  ) {}

  checkoutUrl(host: Host, urls: { success: string; cancel: string }): Promise<string> {
    return this.provider.createCheckoutUrl(host, urls);
  }

  portalUrl(host: Host, returnUrl: string): Promise<string> {
    if (!host.stripeCustomerId && host.subscriptionStatus === 'none') {
      throw new DomainError('invalid_state', 'まだ契約がありません');
    }
    return this.provider.createPortalUrl(host, returnUrl);
  }

  /** 退会時の即時解約。有料契約がなければ何もしない */
  async cancelForAccountDeletion(host: Host): Promise<void> {
    if (host.subscriptionStatus === 'none' || host.subscriptionStatus === 'canceled') return;
    await this.provider.cancelImmediately(host);
  }

  async handleWebhook(rawBody: Buffer, signature: string | undefined): Promise<BillingEvent> {
    const event = await this.provider.parseWebhook(rawBody, signature);
    await this.apply(event);
    return event;
  }

  async apply(event: BillingEvent): Promise<void> {
    // 教室プランの契約か(metadata.orgId、または顧客 ID が教室のもの)
    if (event.type !== 'ignored') {
      const org =
        (event.type === 'subscription_activated' && event.orgId ? await this.repos.organizations.findById(event.orgId) : null) ??
        (event.customerId ? await this.repos.organizations.findByStripeCustomerId(event.customerId) : null);
      if (org) {
        await this.applyToOrganization(org, event);
        return;
      }
    }
    switch (event.type) {
      case 'subscription_activated': {
        const host = (event.hostId ? await this.repos.hosts.findById(event.hostId) : null) ??
          (await this.repos.hosts.findByStripeCustomerId(event.customerId));
        if (!host) throw new DomainError('not_found', '課金イベントに対応する主催者が見つかりません', event);
        await this.repos.hosts.update(host.id, {
          plan: 'pro',
          subscriptionStatus: 'active',
          stripeCustomerId: event.customerId || host.stripeCustomerId,
          stripeSubscriptionId: event.subscriptionId || host.stripeSubscriptionId,
        });
        return;
      }
      case 'subscription_updated': {
        const host = await this.repos.hosts.findByStripeCustomerId(event.customerId);
        if (!host) return; // 別システムの顧客など。無視
        await this.repos.hosts.update(host.id, {
          plan: 'pro',
          subscriptionStatus: event.status,
          stripeSubscriptionId: event.subscriptionId,
        });
        return;
      }
      case 'subscription_canceled': {
        const host = await this.repos.hosts.findByStripeCustomerId(event.customerId);
        if (!host) return;
        await this.repos.hosts.update(host.id, { plan: 'free', subscriptionStatus: 'canceled', stripeSubscriptionId: null });
        return;
      }
      case 'ignored':
        return;
    }
  }

  private async applyToOrganization(org: Organization, event: Exclude<BillingEvent, { type: 'ignored' }>): Promise<void> {
    let status: SubscriptionStatus;
    const patch: Partial<Organization> = {};
    if (event.type === 'subscription_activated') {
      status = 'active';
      patch.stripeCustomerId = event.customerId || org.stripeCustomerId;
      patch.stripeSubscriptionId = event.subscriptionId || org.stripeSubscriptionId;
    } else if (event.type === 'subscription_updated') {
      status = event.status;
      patch.stripeSubscriptionId = event.subscriptionId;
    } else {
      status = 'canceled';
      patch.stripeSubscriptionId = null;
    }
    const updated = await this.repos.organizations.update(org.id, { ...patch, subscriptionStatus: status });
    await this.syncMembers(updated);
  }

  /** 教室の契約状態を所属講師の orgPlanActive に反映 */
  async syncMembers(org: Organization): Promise<void> {
    const active = org.subscriptionStatus === 'active';
    for (const h of await this.repos.hosts.listByOrganization(org.id)) {
      if (h.orgPlanActive !== active) await this.repos.hosts.update(h.id, { orgPlanActive: active });
    }
  }

  // ---- 教室プラン ----

  orgCheckoutUrl(org: Organization, owner: Host, seats: number, urls: { success: string; cancel: string }): Promise<string> {
    return this.provider.createOrgCheckoutUrl(org, owner, seats, urls);
  }

  orgPortalUrl(org: Organization, returnUrl: string): Promise<string> {
    if (org.subscriptionStatus === 'none') throw new DomainError('invalid_state', 'まだ契約がありません');
    return this.provider.createOrgPortalUrl(org, returnUrl);
  }

  async updateOrgSeats(org: Organization, seats: number): Promise<void> {
    if (org.subscriptionStatus !== 'active' && org.subscriptionStatus !== 'past_due') return;
    await this.provider.updateOrgSeats(org, seats);
  }

  async cancelOrgImmediately(org: Organization): Promise<void> {
    if (org.subscriptionStatus === 'none' || org.subscriptionStatus === 'canceled') return;
    await this.provider.cancelOrgImmediately(org);
  }

  /** FakeBillingProvider 用: 教室プランを即時有効化 */
  async activateOrgForDev(orgId: string): Promise<void> {
    const org = await this.repos.organizations.findById(orgId);
    if (!org) throw new DomainError('not_found', '教室が見つかりません');
    await this.apply({
      type: 'subscription_activated',
      customerId: org.stripeCustomerId ?? `fake_org_cus_${orgId.slice(0, 8)}`,
      subscriptionId: `fake_org_sub_${orgId.slice(0, 8)}`,
      hostId: null,
      orgId,
    });
  }

  /** FakeBillingProvider 用: 教室プランを即時解約 */
  async cancelOrgForDev(orgId: string): Promise<void> {
    const org = await this.repos.organizations.findById(orgId);
    if (!org?.stripeCustomerId) return;
    await this.apply({ type: 'subscription_canceled', customerId: org.stripeCustomerId, subscriptionId: org.stripeSubscriptionId ?? '' });
  }

  /** FakeBillingProvider 用: 即時有効化 */
  async activateForDev(hostId: string): Promise<Host> {
    const host = await this.repos.hosts.findById(hostId);
    if (!host) throw new DomainError('not_found', '主催者が見つかりません');
    const customerId = host.stripeCustomerId ?? `fake_cus_${hostId.slice(0, 8)}`;
    await this.apply({ type: 'subscription_activated', customerId, subscriptionId: `fake_sub_${hostId.slice(0, 8)}`, hostId });
    return (await this.repos.hosts.findById(hostId)) as Host;
  }

  /** FakeBillingProvider 用: 即時解約 */
  async cancelForDev(hostId: string): Promise<Host> {
    const host = await this.repos.hosts.findById(hostId);
    if (!host) throw new DomainError('not_found', '主催者が見つかりません');
    if (host.stripeCustomerId) {
      await this.apply({ type: 'subscription_canceled', customerId: host.stripeCustomerId, subscriptionId: host.stripeSubscriptionId ?? '' });
    }
    return (await this.repos.hosts.findById(hostId)) as Host;
  }
}
