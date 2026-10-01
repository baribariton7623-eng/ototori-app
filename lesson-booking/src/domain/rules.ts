import { DomainError } from './errors.js';
import { addDays, addMinutes, diffDays } from './time.js';
import type { Booking, ChangeKind, FeeMethod, LateChangeOption } from './types.js';

/** 予約できるのは今から何日先までか(既定値。講師ごとに Host.bookingHorizonDays で変更できる) */
export const BOOKING_HORIZON_DAYS = 40;
export const MIN_BOOKING_HORIZON_DAYS = 1;
export const MAX_BOOKING_HORIZON_DAYS = 180;

/**
 * レッスン開始までこの日数未満のキャンセル・変更は主催者承認が必要(既定値。Host.lateChangeThresholdDays で変更できる)。
 * 0 にすると承認制にならず、開始前ならいつでも即時反映
 */
export const LATE_CHANGE_THRESHOLD_DAYS = 14;
export const MIN_LATE_CHANGE_THRESHOLD_DAYS = 0;
export const MAX_LATE_CHANGE_THRESHOLD_DAYS = 90;

/** 振替先の範囲(元のレッスン日から前後の日数)の既定値。講師ごとに変更できる(Host.rescheduleRangeDays) */
export const DEFAULT_RESCHEDULE_RANGE_DAYS = 7;
export const MIN_RESCHEDULE_RANGE_DAYS = 1;
export const MAX_RESCHEDULE_RANGE_DAYS = 30;
/** 互換のための別名(既定値) */
export const RESCHEDULE_RANGE_DAYS = DEFAULT_RESCHEDULE_RANGE_DAYS;

/** 日数を「1週間」「10日」のような表示にする */
export function daysLabel(days: number): string {
  return days % 7 === 0 ? `${days / 7}週間` : `${days}日`;
}

/** 振替申請で出せる希望日時の数(第1〜第3希望) */
export const MAX_RESCHEDULE_CANDIDATES = 3;

export const LATE_CHANGE_OPTIONS: readonly LateChangeOption[] = [
  'request_approval',
  'reschedule_within_two_weeks',
  'pay_cancellation_fee',
] as const;

/** 講師の振替期間に合わせた対応方法の表示名 */
export function lateChangeOptionLabel(option: LateChangeOption, rescheduleRangeDays: number = DEFAULT_RESCHEDULE_RANGE_DAYS): string {
  if (option === 'reschedule_within_two_weeks') return `${daysLabel(rescheduleRangeDays)}以内の別日に振替を希望する`;
  return LATE_CHANGE_OPTION_LABELS[option];
}

/** 既定の振替期間での表示名(講師が決まっていない場面用) */
export const LATE_CHANGE_OPTION_LABELS: Record<LateChangeOption, string> = {
  request_approval: '事情を説明して承認を求める',
  // 値(reschedule_within_two_weeks)は保存済みデータと互換のため据え置き。表示は範囲の定数から作る
  reschedule_within_two_weeks: `${daysLabel(RESCHEDULE_RANGE_DAYS)}以内の別日に振替を希望する`,
  pay_cancellation_fee: 'キャンセルフィーを支払う',
};

export const FEE_METHODS: readonly FeeMethod[] = ['card', 'bank_transfer', 'in_person'] as const;

export const FEE_METHOD_LABELS: Record<FeeMethod, string> = {
  card: 'クレジットカード',
  bank_transfer: '銀行振込',
  in_person: '次回レッスン時に手渡し',
};

/** 予約受付ウィンドウ [開始, 終了) を返す */
export function bookingWindow(
  now: Date,
  minLeadMinutes: number,
  horizonDays: number = BOOKING_HORIZON_DAYS,
): { from: Date; to: Date } {
  return {
    from: addMinutes(now, minLeadMinutes),
    to: addDays(now, horizonDays),
  };
}

/** 枠が予約受付ウィンドウ内か */
export function isWithinBookingWindow(
  startAt: Date,
  now: Date,
  minLeadMinutes: number,
  horizonDays: number = BOOKING_HORIZON_DAYS,
): boolean {
  const { from, to } = bookingWindow(now, minLeadMinutes, horizonDays);
  return startAt.getTime() >= from.getTime() && startAt.getTime() <= to.getTime();
}

export function assertWithinBookingWindow(
  startAt: Date,
  now: Date,
  minLeadMinutes: number,
  horizonDays: number = BOOKING_HORIZON_DAYS,
): void {
  if (!isWithinBookingWindow(startAt, now, minLeadMinutes, horizonDays)) {
    throw new DomainError(
      'outside_booking_window',
      `予約できるのは${minLeadMinutes}分後から${horizonDays}日先までです`,
      { startAt: startAt.toISOString(), horizonDays, minLeadMinutes },
    );
  }
}

/** レッスン開始までの残り日数が閾値未満なら「直前変更」 */
export function isLateChange(lessonStartAt: Date, now: Date, thresholdDays: number = LATE_CHANGE_THRESHOLD_DAYS): boolean {
  return diffDays(lessonStartAt, now) < thresholdDays;
}

/** 振替先が元のレッスン日から前後 rangeDays 日以内か */
export function isWithinRescheduleRange(
  originalStartAt: Date,
  proposedStartAt: Date,
  rangeDays: number = DEFAULT_RESCHEDULE_RANGE_DAYS,
): boolean {
  return Math.abs(diffDays(proposedStartAt, originalStartAt)) <= rangeDays;
}

export interface LateChangeInput {
  kind: ChangeKind;
  option: LateChangeOption | undefined;
  message: string | undefined;
  /** 第1希望から順 */
  proposedStartAts: Date[];
  /** 講師の振替期間(元の日から前後の日数)。省略時は既定値 */
  rescheduleRangeDays?: number;
  /** 講師の承認制の日数。メッセージ文面に使う。省略時は既定値 */
  lateChangeThresholdDays?: number;
}

/**
 * 直前変更要求の入力を検証する。
 * - メッセージ必須
 * - 対応方法(3択)必須
 * - 振替(kind=reschedule / option=reschedule_within_two_weeks)は希望日時が 1〜3 件必須(重複不可)で、
 *   いずれも元の日から前後 rescheduleRangeDays 日以内・元の日時とは別
 */
export function validateLateChangeRequest(booking: Booking, input: LateChangeInput): {
  option: LateChangeOption;
  message: string;
  proposedStartAts: Date[];
} {
  const message = input.message?.trim() ?? '';
  if (message.length === 0) {
    throw new DomainError(
      'late_change_requires_request',
      `レッスン開始まで${input.lateChangeThresholdDays ?? LATE_CHANGE_THRESHOLD_DAYS}日未満のキャンセル・変更にはメッセージの入力が必要です`,
      { field: 'message' },
    );
  }
  if (!input.option || !LATE_CHANGE_OPTIONS.includes(input.option)) {
    throw new DomainError(
      'late_change_requires_request',
      `対応方法(承認を求める / ${daysLabel(input.rescheduleRangeDays ?? DEFAULT_RESCHEDULE_RANGE_DAYS)}以内の別日に振替 / キャンセルフィーを支払う)を選択してください`,
      { field: 'option', allowed: LATE_CHANGE_OPTIONS },
    );
  }

  if (input.option === 'pay_cancellation_fee' && input.kind !== 'cancel') {
    throw new DomainError('validation', 'キャンセルフィーの支払いは、キャンセルの申請でのみ選べます', { field: 'option' });
  }

  const needsProposed = input.kind === 'reschedule' || input.option === 'reschedule_within_two_weeks';
  if (needsProposed) {
    const range = input.rescheduleRangeDays ?? DEFAULT_RESCHEDULE_RANGE_DAYS;
    const candidates = validateCandidates(booking, input.proposedStartAts);
    for (const c of candidates) {
      if (!isWithinRescheduleRange(new Date(booking.startAt), c, range)) {
        throw new DomainError('validation', `振替先は元のレッスン日から前後${range}日以内で指定してください`, {
          field: 'proposedStartAts',
          originalStartAt: booking.startAt,
          rangeDays: range,
          invalid: c.toISOString(),
        });
      }
    }
    return { option: input.option, message, proposedStartAts: candidates };
  }
  return { option: input.option, message, proposedStartAts: [] };
}

/** 希望日時の件数・重複・元の日時との一致を検証し、順序を保って返す */
export function validateCandidates(booking: Booking, candidates: Date[], max = MAX_RESCHEDULE_CANDIDATES): Date[] {
  if (candidates.length === 0) {
    throw new DomainError('validation', '振替の希望日時を選んでください', { field: 'proposedStartAts' });
  }
  if (candidates.length > max) {
    throw new DomainError('validation', `振替の希望日時は${max}つまで選べます`, { field: 'proposedStartAts', max });
  }
  const isos = candidates.map((c) => c.toISOString());
  if (new Set(isos).size !== isos.length) {
    throw new DomainError('validation', '同じ日時が重複しています', { field: 'proposedStartAts' });
  }
  if (isos.includes(new Date(booking.startAt).toISOString())) {
    throw new DomainError('validation', '今の予約と同じ日時は選べません', { field: 'proposedStartAts' });
  }
  return candidates;
}
