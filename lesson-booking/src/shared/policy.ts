/**
 * 予約ルールの定数と表示名。サーバーと画面(web/ から @shared/policy で読み込む)で共有する。
 * 画面からも読み込むため、Node の API やサーバー側のモジュールに依存しないこと
 */
import type { FeeMethod, LateChangeOption } from './types.js';

/** 予約できるのは今から何日先までか(既定値。講師ごとに Host.bookingHorizonDays で変更できる) */
export const BOOKING_HORIZON_DAYS = 40;
export const MIN_BOOKING_HORIZON_DAYS = 1;
export const MAX_BOOKING_HORIZON_DAYS = 60;

/**
 * レッスン開始までこの日数未満のキャンセル・変更は主催者承認が必要(既定値。Host.lateChangeThresholdDays で変更できる)。
 * 0 にすると承認制にならず、開始前ならいつでも即時反映
 */
export const LATE_CHANGE_THRESHOLD_DAYS = 14;
export const MIN_LATE_CHANGE_THRESHOLD_DAYS = 0;
export const MAX_LATE_CHANGE_THRESHOLD_DAYS = 60;

/** 振替先の範囲(元のレッスン日から前後の日数)の既定値。講師ごとに変更できる(Host.rescheduleRangeDays) */
export const DEFAULT_RESCHEDULE_RANGE_DAYS = 7;
export const MIN_RESCHEDULE_RANGE_DAYS = 1;
export const MAX_RESCHEDULE_RANGE_DAYS = 30;

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
  reschedule_within_two_weeks: `${daysLabel(DEFAULT_RESCHEDULE_RANGE_DAYS)}以内の別日に振替を希望する`,
  pay_cancellation_fee: 'キャンセルフィーを支払う',
};

export const FEE_METHODS: readonly FeeMethod[] = ['card', 'bank_transfer', 'in_person'] as const;

export const FEE_METHOD_LABELS: Record<FeeMethod, string> = {
  card: 'クレジットカード',
  bank_transfer: '銀行振込',
  in_person: '次回レッスン時に手渡し',
};

/** 金額の表示(3,000円) */
export function yen(amount: number): string {
  return `${amount.toLocaleString('ja-JP')}円`;
}
