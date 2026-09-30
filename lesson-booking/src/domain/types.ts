/**
 * レッスン予約サービスのドメイン型。
 * 時刻はすべて ISO 8601 (UTC) 文字列で保持し、表示時にタイムゾーン変換する。
 */

export type Weekday = 0 | 1 | 2 | 3 | 4 | 5 | 6; // 0=日曜

/** 主催者(講師) */
export interface Host {
  id: string;
  email: string;
  displayName: string;
  /** IANA タイムゾーン。既定 Asia/Tokyo */
  timezone: string;
  /** 1レッスンの長さ(分) */
  lessonMinutes: number;
  /** 予約可能な最短リード時間(分)。今から何分後以降の枠を出すか */
  minLeadMinutes: number;
  createdAt: string;
}

/**
 * 連携カレンダー。
 * - busy_source: 空き枠計算で「予定あり」として扱う(複数可)
 * - write_target: 予約確定時にイベントを書き込む(1件。busy_source としても扱う)
 */
export type CalendarRole = 'busy_source' | 'write_target';

export interface HostCalendar {
  id: string;
  hostId: string;
  /** Google Calendar の calendarId(例: primary, xxx@group.calendar.google.com) */
  calendarId: string;
  label: string;
  role: CalendarRole;
}

/** 曜日別の営業時間枠(この時間帯の中から空き枠を切り出す) */
export interface AvailabilityWindow {
  id: string;
  hostId: string;
  weekday: Weekday;
  /** "HH:MM" (主催者のタイムゾーンでのローカル時刻) */
  startTime: string;
  /** "HH:MM" (排他的終端) */
  endTime: string;
}

/** 生徒 */
export interface Student {
  id: string;
  email: string;
  name: string;
  createdAt: string;
}

export type BookingStatus = 'confirmed' | 'cancelled';

export interface Booking {
  id: string;
  hostId: string;
  studentId: string;
  startAt: string;
  endAt: string;
  status: BookingStatus;
  /** 書き込み先カレンダーのイベントID(連携なしの場合 null) */
  calendarEventId: string | null;
  /** 生徒からの備考 */
  note: string | null;
  /** キャンセルフィー: none=不要 / pending=支払い意思あり未払い / paid=支払済 */
  cancellationFeeStatus: 'none' | 'pending' | 'paid';
  createdAt: string;
  updatedAt: string;
}

/** 変更要求の種類 */
export type ChangeKind = 'cancel' | 'reschedule';

/**
 * 直前(2週間以内)の変更時に生徒が選ぶ対応方法。
 * - request_approval: 事情を説明し、そのまま承認を求める
 * - reschedule_within_two_weeks: 元の日から2週間以内の別日へ振替を希望する
 * - pay_cancellation_fee: キャンセルフィーを支払う
 */
export type LateChangeOption =
  | 'request_approval'
  | 'reschedule_within_two_weeks'
  | 'pay_cancellation_fee';

export type ChangeRequestStatus = 'pending' | 'approved' | 'rejected';

export interface ChangeRequest {
  id: string;
  bookingId: string;
  hostId: string;
  studentId: string;
  kind: ChangeKind;
  option: LateChangeOption;
  message: string;
  /** 振替希望日時(kind=reschedule のとき必須) */
  proposedStartAt: string | null;
  status: ChangeRequestStatus;
  /** 主催者の判断メモ */
  decisionNote: string | null;
  createdAt: string;
  decidedAt: string | null;
}

/** 空き枠 */
export interface Slot {
  startAt: string;
  endAt: string;
}

/** 予定あり区間(カレンダー由来・既存予約由来) */
export interface BusyInterval {
  startAt: string;
  endAt: string;
}
