import type { ConnectEvent, FeePaymentProvider } from '../billing/FeePaymentProvider.js';
import { DomainError } from '../domain/errors.js';
import { PLAN_LABELS, canCollectFeeOnline, limitsFor } from '../domain/plans.js';
import type { Booking, Host, Student } from '../domain/types.js';
import { safeNotify, type Notifier } from '../notify/Notifier.js';
import type { Repositories } from '../repo/Repository.js';

/** キャンセルフィーのオンライン決済 */
export class FeeService {
  constructor(
    private readonly repos: Repositories,
    private readonly provider: FeePaymentProvider,
    private readonly notifier: Notifier,
  ) {}

  /** 講師: Stripe アカウントの作成・オンボーディング開始(プロプランのみ) */
  async startOnboarding(host: Host, urls: { refreshUrl: string; returnUrl: string }): Promise<string> {
    if (!limitsFor(host).onlineFeeCollection) {
      throw new DomainError('plan_limit', `キャンセルフィーのオンライン決済は${PLAN_LABELS.pro}プランの機能です`);
    }
    const { url, accountId } = await this.provider.createOnboardingUrl(host, urls);
    if (host.stripeConnectAccountId !== accountId) {
      await this.repos.hosts.update(host.id, { stripeConnectAccountId: accountId });
    }
    return url;
  }

  /** 講師: 連携状況を Stripe に問い合わせて更新 */
  async refreshStatus(host: Host): Promise<Host> {
    if (!host.stripeConnectAccountId) return host;
    const enabled = await this.provider.fetchChargesEnabled(host.stripeConnectAccountId);
    if (enabled === host.connectChargesEnabled) return host;
    return this.repos.hosts.update(host.id, { connectChargesEnabled: enabled });
  }

  /** 講師: Stripe 連携を外す(Stripe 側のアカウントは講師のものなので削除しない) */
  async disconnect(host: Host): Promise<Host> {
    return this.repos.hosts.update(host.id, { stripeConnectAccountId: null, connectChargesEnabled: false });
  }

  /** 生徒: 未払いのキャンセルフィーの決済ページ URL */
  async checkoutUrl(bookingId: string, student: Student, urls: { successUrl: string; cancelUrl: string }): Promise<string> {
    const booking = await this.repos.bookings.findById(bookingId);
    if (!booking) throw new DomainError('not_found', '予約が見つかりません');
    if (booking.studentId !== student.id) throw new DomainError('forbidden', 'この予約を操作する権限がありません');
    if (booking.cancellationFeeStatus !== 'pending') throw new DomainError('invalid_state', '未払いのキャンセルフィーはありません');
    if (booking.cancellationFeeMethod !== 'card') {
      throw new DomainError('invalid_state', 'この予約のキャンセルフィーはクレジットカード以外の方法で支払うことになっています');
    }
    if (booking.cancellationFeeAmount === null) {
      throw new DomainError('invalid_state', 'キャンセルフィーの金額が設定されていません。講師の案内に従ってお支払いください');
    }
    const host = await this.repos.hosts.findById(booking.hostId);
    if (!host || !canCollectFeeOnline(host)) {
      throw new DomainError('invalid_state', 'この講師はオンライン決済に対応していません。講師の案内に従ってお支払いください');
    }
    return this.provider.createFeeCheckoutUrl(host, booking, student, booking.cancellationFeeAmount, urls);
  }

  async handleWebhook(rawBody: Buffer, signature: string | undefined): Promise<ConnectEvent> {
    const event = await this.provider.parseConnectWebhook(rawBody, signature);
    await this.apply(event);
    return event;
  }

  async apply(event: ConnectEvent): Promise<void> {
    switch (event.type) {
      case 'fee_paid':
        await this.markPaidOnline(event.bookingId, event.accountId);
        return;
      case 'account_updated': {
        const host = await this.repos.hosts.findByConnectAccountId(event.accountId);
        if (host && host.connectChargesEnabled !== event.chargesEnabled) {
          await this.repos.hosts.update(host.id, { connectChargesEnabled: event.chargesEnabled });
        }
        return;
      }
      case 'ignored':
        return;
    }
  }

  /** FakeFeePaymentProvider 用 */
  async completeOnboardingForDev(hostId: string, accountId: string): Promise<void> {
    await this.repos.hosts.update(hostId, { stripeConnectAccountId: accountId, connectChargesEnabled: true });
  }

  /** 決済完了の反映。Webhook の再送に備えて冪等にする */
  async markPaidOnline(bookingId: string, accountId: string | null): Promise<Booking | null> {
    const booking = await this.repos.bookings.findById(bookingId);
    if (!booking) return null;
    const host = await this.repos.hosts.findById(booking.hostId);
    if (!host) return null;
    // 別の講師アカウントの決済で消し込まれないようにする
    if (accountId && host.stripeConnectAccountId && host.stripeConnectAccountId !== accountId) {
      throw new DomainError('forbidden', '決済アカウントが予約の講師と一致しません');
    }
    if (booking.cancellationFeeStatus === 'paid') return booking;
    const updated = await this.repos.bookings.update(booking.id, { cancellationFeeStatus: 'paid' });
    const student = await this.repos.students.findById(booking.studentId);
    if (student) await safeNotify(() => this.notifier.feePaid({ host, student, booking: updated }));
    return updated;
  }
}
