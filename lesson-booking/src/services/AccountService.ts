import { DomainError } from '../domain/errors.js';
import type { Host, Student } from '../domain/types.js';
import type { Repositories } from '../repo/Repository.js';
import type { Clock } from '../repo/InMemoryRepositories.js';
import type { BillingService } from './BillingService.js';
import type { BookingService } from './BookingService.js';
import type { OrganizationService } from './OrganizationService.js';

/** 外部サービス側の後始末(差し替え可能にしてテストしやすくする) */
export interface AccountCleanup {
  /** Google の OAuth トークン失効 + 保存トークン削除 */
  revokeGoogle(hostId: string): Promise<void>;
  /** ログイン基盤(Supabase Auth)のユーザー削除。subject は JWT の sub */
  deleteAuthUser(subject: string): Promise<void>;
}

export const noopCleanup: AccountCleanup = {
  async revokeGoogle() {},
  async deleteAuthUser() {},
};

export const HOST_DELETION_REASON =
  '講師がサービスの利用を終了したため、このレッスンはキャンセルとなりました。ご迷惑をおかけして申し訳ありません。';

export interface DeletionResult {
  deletedHost: boolean;
  deletedStudent: boolean;
  cancelledBookings: number;
}

/**
 * 退会(アカウントとデータの削除)。
 * - 主催者: 今後の予約をすべて休講扱いで取り消して生徒に通知 → 有料契約を即時解約 → Google 連携を失効 → 全データ削除
 * - 生徒: 今後の確定予約が残っている場合は拒否(直前キャンセルの承認ルールを退会で回避させない)
 * - 最後にログインアカウント(Supabase Auth)を削除
 */
export class AccountService {
  constructor(
    private readonly repos: Repositories,
    private readonly bookings: BookingService,
    private readonly billing: BillingService,
    private readonly cleanup: AccountCleanup,
    private readonly clock: Clock,
    private readonly organizations?: OrganizationService,
  ) {}

  async deleteAccount(input: { email: string; subject: string | null; host: Host | null }): Promise<DeletionResult> {
    const student = await this.repos.students.findByEmail(input.email);
    if (student) await this.assertNoFutureStudentBookings(student);

    let cancelledBookings = 0;
    if (input.host) {
      const cancelled = await this.bookings.cancelAllFutureByHost(input.host.id, HOST_DELETION_REASON);
      cancelledBookings = cancelled.length;
      // 教室の管理者なら教室ごと削除(契約解約・所属講師の解除)、所属講師なら脱退
      const fresh = (await this.repos.hosts.findById(input.host.id)) ?? input.host;
      await this.organizations?.handleHostDeletion(fresh);
      await this.billing.cancelForAccountDeletion(input.host);
      await this.cleanup.revokeGoogle(input.host.id);
      await this.repos.hosts.delete(input.host.id);
    }
    if (student) await this.repos.students.delete(student.id);
    if (input.subject) await this.cleanup.deleteAuthUser(input.subject);

    return { deletedHost: input.host !== null, deletedStudent: student !== null, cancelledBookings };
  }

  /**
   * 生徒の退会前チェック。退会すると予約の記録が消えるため、講師との精算が残っているものは先に済ませてもらう
   * - 今後の確定予約(直前キャンセルの承認ルールを退会で回避させない)
   * - 未払いのキャンセルフィー(講師側の請求記録が消えないように)
   */
  private async assertNoFutureStudentBookings(student: Student): Promise<void> {
    const now = this.clock.now().getTime();
    const bookings = await this.repos.bookings.listByStudent(student.id);
    const future = bookings.filter((b) => b.status === 'confirmed' && new Date(b.endAt).getTime() > now);
    if (future.length > 0) {
      throw new DomainError('invalid_state', `今後の予約が${future.length}件あります。すべてキャンセルしてから退会してください`, {
        futureBookings: future.map((b) => b.id),
      });
    }
    const unpaid = bookings.filter((b) => b.cancellationFeeStatus === 'pending');
    if (unpaid.length > 0) {
      throw new DomainError('invalid_state', `未払いのキャンセルフィーが${unpaid.length}件あります。お支払いが済んでから退会してください`, {
        unpaidFees: unpaid.map((b) => b.id),
      });
    }
  }
}
