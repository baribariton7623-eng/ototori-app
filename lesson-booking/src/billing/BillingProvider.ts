import type { Host } from '../domain/types.js';

/** 課金プロバイダから届いた出来事を、プロバイダ非依存の形に正規化したもの */
export type BillingEvent =
  | { type: 'subscription_activated'; customerId: string; subscriptionId: string; hostId: string | null }
  | { type: 'subscription_updated'; customerId: string; subscriptionId: string; status: 'active' | 'past_due' | 'canceled' }
  | { type: 'subscription_canceled'; customerId: string; subscriptionId: string }
  | { type: 'ignored'; raw: string };

export interface BillingProvider {
  /** プロ契約の決済ページ URL を返す(Stripe Checkout など) */
  createCheckoutUrl(host: Host, urls: { success: string; cancel: string }): Promise<string>;
  /** 支払い方法変更・解約などの管理ページ URL */
  createPortalUrl(host: Host, returnUrl: string): Promise<string>;
  /** 退会時: サブスクリプションを即時解約する(請求記録は Stripe 側に残る) */
  cancelImmediately(host: Host): Promise<void>;
  /** Webhook の署名検証と正規化。不正なら throw */
  parseWebhook(rawBody: Buffer, signature: string | undefined): Promise<BillingEvent>;
}
