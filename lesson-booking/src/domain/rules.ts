import { DomainError } from './errors.js';
import { addDays, addMinutes, diffDays } from './time.js';
import {
  BOOKING_HORIZON_DAYS,
  DEFAULT_RESCHEDULE_RANGE_DAYS,
  LATE_CHANGE_OPTIONS,
  LATE_CHANGE_THRESHOLD_DAYS,
  MAX_RESCHEDULE_CANDIDATES,
  daysLabel,
} from '../shared/policy.js';
import type { Booking, ChangeKind, LateChangeOption } from '../shared/types.js';

// 定数と表示名は画面と共有する(src/shared/policy.ts)
export * from '../shared/policy.js';

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
  if (input.option === 'reschedule_within_two_weeks' && input.kind !== 'reschedule') {
    // 承認時は kind で処理を分けるため、キャンセルとして保存されると振替のつもりがキャンセルになる
    throw new DomainError('validation', '別日への振替は、日時変更の申請でのみ選べます', { field: 'option' });
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
