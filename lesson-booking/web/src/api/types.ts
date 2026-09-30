/** バックエンド(../src/domain/types.ts)の API 応答型。手で同期する */

export type LateChangeOption = 'request_approval' | 'reschedule_within_two_weeks' | 'pay_cancellation_fee';
export type ChangeKind = 'cancel' | 'reschedule';

export type Plan = 'free' | 'pro';
export type SubscriptionStatus = 'none' | 'active' | 'past_due' | 'canceled';

export interface PlanLimits {
  maxCalendars: number | null;
  maxBookingsPerMonth: number | null;
  calendarWrite: boolean;
}

export interface Rules {
  bookingHorizonDays: number;
  lateChangeThresholdDays: number;
  rescheduleRangeDays: number;
  lateChangeOptions: { value: LateChangeOption; label: string }[];
  plans: { plan: Plan; label: string; limits: PlanLimits }[];
}

export interface BillingInfo {
  plan: Plan;
  effectivePlan: Plan;
  planLabel: string;
  subscriptionStatus: SubscriptionStatus;
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
  timezone: string;
  lessonMinutes: number;
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
  createdAt: string;
  updatedAt: string;
}

export interface StudentBooking extends Booking {
  requiresApprovalToChange: boolean;
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
  proposedStartAt: string | null;
  status: 'pending' | 'approved' | 'rejected';
  decisionNote: string | null;
  createdAt: string;
  decidedAt: string | null;
}

export interface HostChangeRequest extends ChangeRequest {
  optionLabel: string;
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
