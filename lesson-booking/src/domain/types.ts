/**
 * レッスン予約サービスのドメイン型。
 * 時刻はすべて ISO 8601 (UTC) 文字列で保持し、表示時にタイムゾーン変換する。
 */

export type Weekday = 0 | 1 | 2 | 3 | 4 | 5 | 6; // 0=日曜

export type Plan = 'free' | 'pro';

/** キャンセルフィーの支払い方法 */
export type FeeMethod = 'card' | 'bank_transfer' | 'in_person';
export type SubscriptionStatus = 'none' | 'active' | 'past_due' | 'canceled';

/** 主催者(講師)。SaaS のテナント単位 */
export interface Host {
  id: string;
  email: string;
  displayName: string;
  /** 公開予約ページの URL 用識別子 (^[a-z0-9-]{3,32}$, unique) */
  slug: string;
  /** 生徒向けの紹介文 */
  bio: string;
  plan: Plan;
  subscriptionStatus: SubscriptionStatus;
  stripeCustomerId: string | null;
  stripeSubscriptionId: string | null;
  /** 直前キャンセルで「キャンセルフィーを支払う」が承認されたときの金額(円)。null なら金額は講師と生徒で個別に決める */
  cancellationFeeAmount: number | null;
  /** キャンセルフィーを受け取る講師本人の Stripe アカウント(Connect Standard) */
  stripeConnectAccountId: string | null;
  /** その Stripe アカウントで決済を受けられる状態か(本人確認・口座登録済み) */
  connectChargesEnabled: boolean;
  /** 受け付けるキャンセルフィーの支払い方法。card は Stripe 連携済みのときだけ実際に選べる */
  feeMethods: FeeMethod[];
  /** 銀行振込の振込先(銀行名・支店・種別・番号・名義)。承認後、その生徒にだけ表示する */
  bankTransferInfo: string;
  /** 所属する教室(組織)。未所属なら null */
  organizationId: string | null;
  /** 所属教室の契約が有効か(教室の契約状態を所属講師に複製して持つ。OrganizationService が同期する) */
  orgPlanActive: boolean;
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
  /** 承認時点のキャンセルフィー金額(円)。金額未設定なら null */
  cancellationFeeAmount: number | null;
  /** 講師が承認したキャンセルフィーの支払い方法 */
  cancellationFeeMethod: FeeMethod | null;
  /** 前日リマインドを送った時刻。日時変更で null に戻る */
  reminderSentAt: string | null;
  createdAt: string;
  updatedAt: string;
}

/** 変更要求の種類 */
export type ChangeKind = 'cancel' | 'reschedule';

/**
 * 直前(2週間以内)の変更時に生徒が選ぶ対応方法。
 * - request_approval: 事情を説明し、そのまま承認を求める
 * - reschedule_within_two_weeks: 元の日から前後 RESCHEDULE_RANGE_DAYS 日(現在 7 日)以内の別日へ振替を希望する(値の名前は互換のため据え置き)
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
  /** 振替の希望日時。第1希望から順に最大 3 件(kind=reschedule のとき 1 件以上必須) */
  proposedStartAts: string[];
  /** 承認時に講師が候補から選んだ振替先 */
  approvedStartAt: string | null;
  /** option=pay_cancellation_fee のとき生徒が選んだ支払い方法 */
  feeMethod: FeeMethod | null;
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

/** 教室(組織)。複数の講師をまとめて契約・紹介する単位 */
export interface Organization {
  id: string;
  name: string;
  /** 公開ページ #/o/<slug> 用。講師の slug とは別の名前空間 */
  slug: string;
  bio: string;
  /** 管理者(作成した講師)。管理者も所属講師の 1 人 */
  ownerHostId: string;
  subscriptionStatus: SubscriptionStatus;
  stripeCustomerId: string | null;
  stripeSubscriptionId: string | null;
  createdAt: string;
}

export type InvitationStatus = 'pending' | 'accepted' | 'declined' | 'revoked';

/** 教室への招待。招待されたメールアドレスでログインした講師が承諾する */
export interface OrgInvitation {
  id: string;
  organizationId: string;
  email: string;
  status: InvitationStatus;
  invitedByHostId: string;
  createdAt: string;
  respondedAt: string | null;
}
