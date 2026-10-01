/**
 * API の応答型。データの型はサーバーと共有し(src/shared/types.ts)、ここには API 固有の形だけを書く
 */
import type {
  Booking,
  ChangeRequest,
  FeeMethod,
  Host,
  LateChangeOption,
  Organization as DomainOrganization,
  OrgInvitation as DomainOrgInvitation,
  Plan,
  PlanLimits,
  SubscriptionStatus,
} from '@shared/types';

export type {
  AvailabilityWindow,
  Booking,
  ChangeKind,
  ChangeRequest,
  FeeMethod,
  Host,
  HostCalendar,
  LateChangeOption,
  Plan,
  PlanLimits,
  Slot,
  SubscriptionStatus,
} from '@shared/types';

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

/** 教室(画面に返す項目。Stripe の ID は含まない) */
export type Organization = Pick<DomainOrganization, 'id' | 'name' | 'slug' | 'bio' | 'ownerHostId' | 'subscriptionStatus' | 'createdAt'>;

export type OrgInvitation = Pick<DomainOrgInvitation, 'id' | 'organizationId' | 'email' | 'status' | 'createdAt'>;

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
