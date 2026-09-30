import type { Booking, ChangeKind, ChangeRequest, Host, Student } from '../domain/types.js';

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
  /** キャンセルフィーがオンラインで支払われた */
  feePaid(e: Parties & { booking: Booking }): Promise<void>;
}

export const noopNotifier: Notifier = {
  async bookingCreated() {},
  async bookingChanged() {},
  async changeRequested() {},
  async changeDecided() {},
  async cancelledByHost() {},
  async lessonReminder() {},
  async feePaid() {},
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
