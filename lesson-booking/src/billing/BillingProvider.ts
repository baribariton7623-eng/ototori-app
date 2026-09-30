import type { Host, Organization } from '../domain/types.js';

/** 課金プロバイダから届いた出来事を、プロバイダ非依存の形に正規化したもの */
export type BillingEvent =
  | { type: 'subscription_activated'; customerId: string; subscriptionId: string; hostId: string | null; orgId?: string | null }
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
  // ---- 教室プラン(講師 1 人あたりの席数課金) ----
  /** 教室プランの決済ページ URL。seats = 現在の所属講師数 */
  createOrgCheckoutUrl(org: Organization, owner: Host, seats: number, urls: { success: string; cancel: string }): Promise<string>;
  createOrgPortalUrl(org: Organization, returnUrl: string): Promise<string>;
  /** 所属講師数の変化を契約数量に反映(日割り) */
  updateOrgSeats(org: Organization, seats: number): Promise<void>;
  cancelOrgImmediately(org: Organization): Promise<void>;
  /** Webhook の署名検証と正規化。不正なら throw */
  parseWebhook(rawBody: Buffer, signature: string | undefined): Promise<BillingEvent>;
}
