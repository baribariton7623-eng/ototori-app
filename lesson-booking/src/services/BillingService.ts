import type { BillingEvent, BillingProvider } from '../billing/BillingProvider.js';
import { DomainError } from '../domain/errors.js';
import type { Host } from '../domain/types.js';
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
