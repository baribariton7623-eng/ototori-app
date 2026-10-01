/** バックエンド(../src/domain/types.ts)の API 応答型。手で同期する */

export type LateChangeOption = 'request_approval' | 'reschedule_within_two_weeks' | 'pay_cancellation_fee';
export type FeeMethod = 'card' | 'bank_transfer' | 'in_person';
export type ChangeKind = 'cancel' | 'reschedule';

export type Plan = 'free' | 'pro';
export type SubscriptionStatus = 'none' | 'active' | 'past_due' | 'canceled';

export interface PlanLimits {
  maxCalendars: number | null;
  maxBookingsPerMonth: number | null;
  calendarWrite: boolean;
  onlineFeeCollection: boolean;
}

export interface Rules {
  bookingHorizonDays: number;
  lateChangeThresholdDays: number;
  /** 振替期間の既定値(実際の範囲は講師ごと) */
  rescheduleRangeDays: number;
  rescheduleRangeLimits: { min: number; max: number };
  /** 講師が設定できるルールの上下限 */
  policyLimits: {
    bookingHorizonDays: { min: number; max: number };
    lateChangeThresholdDays: { min: number; max: number };
    rescheduleRangeDays: { min: number; max: number };
  };
  lateChangeOptions: { value: LateChangeOption; label: string }[];
  feeMethods: { value: FeeMethod; label: string }[];
  plans: { plan: Plan; label: string; limits: PlanLimits }[];
}

export interface BillingInfo {
  plan: Plan;
  effectivePlan: Plan;
  planLabel: string;
  subscriptionStatus: SubscriptionStatus;
  viaOrganization: boolean;
  limits: PlanLimits;
  usage: { bookingsThisMonth: number; calendars: number };
  publicUrl: string;
}

export interface Me {
  email: string;
  name: string;
  role: 'host' | 'student';
  host: Host | null;
}

export interface Host {
  id: string;
  email: string;
  displayName: string;
  slug: string;
  bio: string;
  plan: Plan;
  subscriptionStatus: SubscriptionStatus;
  cancellationFeeAmount: number | null;
  stripeConnectAccountId: string | null;
  connectChargesEnabled: boolean;
  feeMethods: FeeMethod[];
  bankTransferInfo: string;
  organizationId: string | null;
  orgPlanActive: boolean;
  timezone: string;
  lessonMinutes: number;
  rescheduleRangeDays: number;
  lateChangeThresholdDays: number;
  bookingHorizonDays: number;
  minLeadMinutes: number;
  createdAt: string;
}

export interface PublicHost {
  id: string;
  slug: string;
  displayName: string;
  bio: string;
  timezone: string;
  lessonMinutes: number;
  rescheduleRangeDays: number;
  lateChangeThresholdDays: number;
  bookingHorizonDays: number;
  cancellationFeeAmount: number | null;
  onlineFeePayment: boolean;
  /** 生徒が今選べる支払い方法 */
  feeMethods: FeeMethod[];
}

export interface HostCalendar {
  id: string;
  hostId: string;
  calendarId: string;
  label: string;
  role: 'busy_source' | 'write_target';
}

export interface AvailabilityWindow {
  id: string;
  hostId: string;
  weekday: number;
  startTime: string;
  endTime: string;
}

export interface Slot {
  startAt: string;
  endAt: string;
}

export interface Booking {
  id: string;
  hostId: string;
  studentId: string;
  startAt: string;
  endAt: string;
  status: 'confirmed' | 'cancelled';
  calendarEventId: string | null;
  note: string | null;
  cancellationFeeStatus: 'none' | 'pending' | 'paid';
  cancellationFeeAmount: number | null;
  cancellationFeeMethod: FeeMethod | null;
  reminderSentAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface StudentBooking extends Booking {
  requiresApprovalToChange: boolean;
  /** 未払いのキャンセルフィーをオンラインで払えるか */
  feePayableOnline: boolean;
  /** 振込で承認された未払いの予約にだけ付く振込先 */
  bankTransferInfo?: string;
  /** この予約の講師の振替期間(元の日から前後の日数) */
  rescheduleRangeDays: number;
  /** この予約の講師が、開始の何日前から承認制にしているか */
  lateChangeThresholdDays: number;
  /** この予約への変更要求(古い順) */
  changeRequests: ChangeRequest[];
}

export interface ConnectStatus {
  available: boolean;
  accountId: string | null;
  chargesEnabled: boolean;
  active: boolean;
  cancellationFeeAmount: number | null;
}

export interface StudentSummary {
  id: string;
  email: string;
  name: string;
}

export interface ChangeRequest {
  id: string;
  bookingId: string;
  hostId: string;
  studentId: string;
  kind: ChangeKind;
  option: LateChangeOption;
  message: string;
  /** 振替の希望日時(第1希望から順) */
  proposedStartAts: string[];
  /** 承認時に講師が選んだ振替先 */
  approvedStartAt: string | null;
  feeMethod: FeeMethod | null;
  status: 'pending' | 'approved' | 'rejected';
  decisionNote: string | null;
  createdAt: string;
  decidedAt: string | null;
}

export interface HostChangeRequest extends ChangeRequest {
  optionLabel: string;
  feeMethodLabel: string | null;
  /** 承認待ちの振替: 候補ごとの現在の空き状況 */
  candidates: { startAt: string; available: boolean }[];
  booking: Booking | null;
  student: StudentSummary | null;
}

export type HostBooking = Booking & { student: StudentSummary | null };

export type ChangeOutcome =
  | { type: 'applied'; booking: Booking }
  | { type: 'pending_approval'; booking: Booking; request: ChangeRequest };

export interface ApiErrorBody {
  error: { code: string; message: string; details?: unknown };
}

export interface Organization {
  id: string;
  name: string;
  slug: string;
  bio: string;
  ownerHostId: string;
  subscriptionStatus: SubscriptionStatus;
  createdAt: string;
}

export interface OrgInvitation {
  id: string;
  organizationId: string;
  email: string;
  status: 'pending' | 'accepted' | 'declined' | 'revoked';
  createdAt: string;
}

export type OrgMember = PublicHost & { email?: string; isOwner: boolean };

export interface MyOrganization {
  organization: Organization;
  isOwner: boolean;
  publicUrl: string;
  members: OrgMember[];
  invitations: OrgInvitation[];
}

export type MyInvitation = OrgInvitation & { organizationName: string; organizationSlug: string };

export interface PublicOrganization {
  slug: string;
  name: string;
  bio: string;
  teachers: PublicHost[];
}
