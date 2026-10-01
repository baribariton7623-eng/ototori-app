import type { Booking, Host, Student } from '../shared/types.js';

/** 講師の Stripe アカウント(Connect)まわりの出来事を正規化したもの */
export type ConnectEvent =
  | { type: 'fee_paid'; bookingId: string; accountId: string }
  | { type: 'account_updated'; accountId: string; chargesEnabled: boolean }
  | { type: 'ignored'; raw: string };

/**
 * キャンセルフィーの決済。講師本人の Stripe アカウントで直接決済(Direct charge)し、
 * 運営者のアカウントを資金が経由しない構成にする。
 */
export interface FeePaymentProvider {
  /** 講師の Stripe アカウントを(なければ)作り、本人確認・口座登録のオンボーディング URL を返す */
  createOnboardingUrl(host: Host, urls: { refreshUrl: string; returnUrl: string }): Promise<{ url: string; accountId: string }>;
  /** 講師アカウントが決済を受けられる状態か */
  fetchChargesEnabled(accountId: string): Promise<boolean>;
  /** 生徒がキャンセルフィーを支払う決済ページ URL */
  createFeeCheckoutUrl(
    host: Host,
    booking: Booking,
    student: Student,
    amount: number,
    urls: { successUrl: string; cancelUrl: string },
  ): Promise<string>;
  /** Connect 用 Webhook の署名検証と正規化 */
  parseConnectWebhook(rawBody: Buffer, signature: string | undefined): Promise<ConnectEvent>;
}
