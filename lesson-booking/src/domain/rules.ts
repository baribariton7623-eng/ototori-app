import { DomainError } from './errors.js';
import { addDays, addMinutes, diffDays } from './time.js';
import type { Booking, ChangeKind, FeeMethod, LateChangeOption } from './types.js';

/** 予約できるのは今日から何日先まで */
export const BOOKING_HORIZON_DAYS = 40;

/** レッスン開始までこの日数未満のキャンセル・変更は主催者承認が必要 */
export const LATE_CHANGE_THRESHOLD_DAYS = 14;

/** 振替先は元のレッスン日からこの日数以内 */
export const RESCHEDULE_RANGE_DAYS = 14;

export const LATE_CHANGE_OPTIONS: readonly LateChangeOption[] = [
  'request_approval',
  'reschedule_within_two_weeks',
  'pay_cancellation_fee',
] as const;

export const LATE_CHANGE_OPTION_LABELS: Record<LateChangeOption, string> = {
  request_approval: '事情を説明して承認を求める',
  reschedule_within_two_weeks: '2週間以内の別日に振替を希望する',
  pay_cancellation_fee: 'キャンセルフィーを支払う',
};

export const FEE_METHODS: readonly FeeMethod[] = ['card', 'bank_transfer', 'in_person'] as const;

export const FEE_METHOD_LABELS: Record<FeeMethod, string> = {
  card: 'クレジットカード',
  bank_transfer: '銀行振込',
  in_person: '次回レッスン時に手渡し',
};

/** 予約受付ウィンドウ [開始, 終了) を返す */
export function bookingWindow(now: Date, minLeadMinutes: number): { from: Date; to: Date } {
  return {
    from: addMinutes(now, minLeadMinutes),
    to: addDays(now, BOOKING_HORIZON_DAYS),
  };
}

/** 枠が予約受付ウィンドウ内か */
export function isWithinBookingWindow(startAt: Date, now: Date, minLeadMinutes: number): boolean {
  const { from, to } = bookingWindow(now, minLeadMinutes);
  return startAt.getTime() >= from.getTime() && startAt.getTime() <= to.getTime();
}

export function assertWithinBookingWindow(startAt: Date, now: Date, minLeadMinutes: number): void {
  if (!isWithinBookingWindow(startAt, now, minLeadMinutes)) {
    throw new DomainError(
      'outside_booking_window',
      `予約できるのは${minLeadMinutes}分後から${BOOKING_HORIZON_DAYS}日先までです`,
      { startAt: startAt.toISOString(), horizonDays: BOOKING_HORIZON_DAYS, minLeadMinutes },
    );
  }
}

/** レッスン開始までの残り日数が閾値未満なら「直前変更」 */
export function isLateChange(lessonStartAt: Date, now: Date): boolean {
  return diffDays(lessonStartAt, now) < LATE_CHANGE_THRESHOLD_DAYS;
}

/** 振替先が元のレッスン日から前後 RESCHEDULE_RANGE_DAYS 日以内か */
export function isWithinRescheduleRange(originalStartAt: Date, proposedStartAt: Date): boolean {
  return Math.abs(diffDays(proposedStartAt, originalStartAt)) <= RESCHEDULE_RANGE_DAYS;
}

export interface LateChangeInput {
  kind: ChangeKind;
  option: LateChangeOption | undefined;
  message: string | undefined;
  proposedStartAt: Date | undefined;
}

/**
 * 直前変更要求の入力を検証する。
 * - メッセージ必須
 * - 対応方法(3択)必須
 * - 振替(kind=reschedule / option=reschedule_within_two_weeks)は振替先日時が必須で、元の日から2週間以内
 */
export function validateLateChangeRequest(booking: Booking, input: LateChangeInput): {
  option: LateChangeOption;
  message: string;
  proposedStartAt: Date | null;
} {
  const message = input.message?.trim() ?? '';
  if (message.length === 0) {
    throw new DomainError(
      'late_change_requires_request',
      `レッスン開始まで${LATE_CHANGE_THRESHOLD_DAYS}日未満のキャンセル・変更にはメッセージの入力が必要です`,
      { field: 'message' },
    );
  }
  if (!input.option || !LATE_CHANGE_OPTIONS.includes(input.option)) {
    throw new DomainError(
      'late_change_requires_request',
      '対応方法(承認を求める / 2週間以内の別日に振替 / キャンセルフィーを支払う)を選択してください',
      { field: 'option', allowed: LATE_CHANGE_OPTIONS },
    );
  }

  if (input.option === 'pay_cancellation_fee' && input.kind !== 'cancel') {
    throw new DomainError('validation', 'キャンセルフィーの支払いは、キャンセルの申請でのみ選べます', { field: 'option' });
  }

  const needsProposed = input.kind === 'reschedule' || input.option === 'reschedule_within_two_weeks';
  if (needsProposed) {
    if (!input.proposedStartAt) {
      throw new DomainError('validation', '振替希望日時を指定してください', { field: 'proposedStartAt' });
    }
    if (!isWithinRescheduleRange(new Date(booking.startAt), input.proposedStartAt)) {
      throw new DomainError(
        'validation',
        `振替先は元のレッスン日から${RESCHEDULE_RANGE_DAYS}日以内で指定してください`,
        { field: 'proposedStartAt', originalStartAt: booking.startAt },
      );
    }
    return { option: input.option, message, proposedStartAt: input.proposedStartAt };
  }
  return { option: input.option, message, proposedStartAt: null };
}
