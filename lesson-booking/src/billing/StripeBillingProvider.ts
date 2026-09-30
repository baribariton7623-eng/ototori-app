import Stripe from 'stripe';
import { DomainError } from '../domain/errors.js';
import type { Host } from '../domain/types.js';
import type { HostRepository } from '../repo/Repository.js';
import type { BillingEvent, BillingProvider } from './BillingProvider.js';

export interface StripeConfig {
  secretKey: string;
  webhookSecret: string;
  /** プロプランの Price ID(price_...)。月額の recurring price を想定 */
  proPriceId: string;
}

/**
 * Stripe Checkout(サブスクリプション)+ Customer Portal + Webhook。
 * 顧客は主催者 1 人につき 1 Customer。metadata.hostId で突き合わせる。
 */
export class StripeBillingProvider implements BillingProvider {
  private readonly stripe: Stripe;

  constructor(
    private readonly cfg: StripeConfig,
    private readonly hosts: HostRepository,
  ) {
    this.stripe = new Stripe(cfg.secretKey);
  }

  async createCheckoutUrl(host: Host, urls: { success: string; cancel: string }): Promise<string> {
    const customerId = await this.ensureCustomer(host);
    const session = await this.stripe.checkout.sessions.create({
      mode: 'subscription',
      customer: customerId,
      line_items: [{ price: this.cfg.proPriceId, quantity: 1 }],
      success_url: urls.success,
      cancel_url: urls.cancel,
      allow_promotion_codes: true,
      metadata: { hostId: host.id },
      subscription_data: { metadata: { hostId: host.id } },
    });
    if (!session.url) throw new DomainError('validation', 'Stripe Checkout の URL を取得できませんでした');
    return session.url;
  }

  async createPortalUrl(host: Host, returnUrl: string): Promise<string> {
    const customerId = await this.ensureCustomer(host);
    const session = await this.stripe.billingPortal.sessions.create({ customer: customerId, return_url: returnUrl });
    return session.url;
  }

  async cancelImmediately(host: Host): Promise<void> {
    if (!host.stripeSubscriptionId) return;
    try {
      await this.stripe.subscriptions.cancel(host.stripeSubscriptionId);
    } catch (e) {
      // 既に解約済み(resource_missing)なら成功扱い
      if ((e as { code?: string }).code === 'resource_missing') return;
      throw e;
    }
  }

  async parseWebhook(rawBody: Buffer, signature: string | undefined): Promise<BillingEvent> {
    if (!signature) throw new DomainError('forbidden', 'Stripe 署名がありません');
    let event: Stripe.Event;
    try {
      event = this.stripe.webhooks.constructEvent(rawBody, signature, this.cfg.webhookSecret);
    } catch (e) {
      throw new DomainError('forbidden', `Stripe 署名の検証に失敗しました: ${e instanceof Error ? e.message : String(e)}`);
    }
    switch (event.type) {
      case 'checkout.session.completed': {
        const s = event.data.object;
        if (s.mode !== 'subscription') return { type: 'ignored', raw: event.type };
        return {
          type: 'subscription_activated',
          customerId: idOf(s.customer),
          subscriptionId: idOf(s.subscription),
          hostId: s.metadata?.hostId ?? null,
        };
      }
      case 'customer.subscription.updated': {
        const sub = event.data.object;
        return { type: 'subscription_updated', customerId: idOf(sub.customer), subscriptionId: sub.id, status: mapStatus(sub.status) };
      }
      case 'customer.subscription.deleted': {
        const sub = event.data.object;
        return { type: 'subscription_canceled', customerId: idOf(sub.customer), subscriptionId: sub.id };
      }
      default:
        return { type: 'ignored', raw: event.type };
    }
  }

  private async ensureCustomer(host: Host): Promise<string> {
    if (host.stripeCustomerId) return host.stripeCustomerId;
    const customer = await this.stripe.customers.create({
      email: host.email,
      name: host.displayName,
      metadata: { hostId: host.id },
    });
    await this.hosts.update(host.id, { stripeCustomerId: customer.id });
    return customer.id;
  }
}

function idOf(v: string | { id: string } | null | undefined): string {
  if (!v) return '';
  return typeof v === 'string' ? v : v.id;
}

function mapStatus(s: Stripe.Subscription.Status): 'active' | 'past_due' | 'canceled' {
  switch (s) {
    case 'active':
    case 'trialing':
      return 'active';
    case 'past_due':
    case 'unpaid':
    case 'incomplete':
      return 'past_due';
    default:
      return 'canceled';
  }
}
