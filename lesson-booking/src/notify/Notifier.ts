import type { Booking, ChangeKind, ChangeRequest, Host, Organization, Student } from '../shared/types.js';

interface Parties {
  host: Host;
  student: Student;
}

/**
 * 業務イベントの通知口。BookingService / AccountService が操作の最後に 1 回だけ呼ぶ。
 * 実装(メール等)が失敗しても業務処理は成功させるため、呼び出し側は safeNotify で包む。
 */
export interface Notifier {
  /** 生徒が予約した */
  bookingCreated(e: Parties & { booking: Booking }): Promise<void>;
  /** 生徒が猶予期間内にキャンセル・変更した(即時反映) */
  bookingChanged(e: Parties & { kind: ChangeKind; before: Booking; after: Booking }): Promise<void>;
  /** 生徒が直前の変更要求を出した(主催者の承認待ち) */
  changeRequested(e: Parties & { request: ChangeRequest; booking: Booking }): Promise<void>;
  /** 主催者が変更要求を承認・却下した */
  changeDecided(e: Parties & { request: ChangeRequest; before: Booking; after: Booking }): Promise<void>;
  /** 主催者が予約をキャンセルした(休講・退会) */
  cancelledByHost(e: Parties & { booking: Booking; reason: string }): Promise<void>;
  /** レッスン前日のリマインド(生徒宛) */
  lessonReminder(e: Parties & { booking: Booking }): Promise<void>;
  /** 主催者がキャンセルフィーの支払い方法を変更した */
  feeMethodChanged(e: Parties & { booking: Booking }): Promise<void>;
  /** キャンセルフィーがオンラインで支払われた */
  feePaid(e: Parties & { booking: Booking }): Promise<void>;
  /** 教室への招待(招待先はまだ登録していない可能性がある) */
  orgInvited(e: { organization: Organization; inviter: Host; email: string }): Promise<void>;
  /** Google カレンダーへの反映に失敗した(主催者宛。同じ予約では失敗が続いても最初の 1 回だけ) */
  calendarSyncFailed(e: { host: Host; student: Student | null; booking: Booking; action: CalendarSyncAction; reason: string }): Promise<void>;
}

/** カレンダーに対して行おうとした操作 */
export type CalendarSyncAction = 'create' | 'update' | 'delete';

export const noopNotifier: Notifier = {
  async bookingCreated() {},
  async bookingChanged() {},
  async changeRequested() {},
  async changeDecided() {},
  async cancelledByHost() {},
  async lessonReminder() {},
  async feeMethodChanged() {},
  async feePaid() {},
  async orgInvited() {},
  async calendarSyncFailed() {},
};

/** 通知の失敗をログに落として握りつぶす */
export async function safeNotify(fn: () => Promise<void>, log: (msg: string, err: unknown) => void = defaultLog): Promise<void> {
  try {
    await fn();
  } catch (e) {
    log('[notify] 通知の送信に失敗しました', e);
  }
}

function defaultLog(msg: string, err: unknown): void {
  console.error(msg, err);
}
