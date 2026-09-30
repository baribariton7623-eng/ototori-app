import { authHeaders } from './auth';
import type {
  ApiErrorBody,
  AvailabilityWindow,
  BillingInfo,
  ConnectStatus,
  ChangeKind,
  ChangeOutcome,
  ChangeRequest,
  Host,
  HostBooking,
  HostCalendar,
  HostChangeRequest,
  LateChangeOption,
  Me,
  MyInvitation,
  MyOrganization,
  Organization,
  PublicOrganization,
  PublicHost,
  Rules,
  Slot,
  StudentBooking,
} from './types';

export class ApiError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
    readonly details?: unknown,
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

async function request<T>(method: string, path: string, body?: unknown): Promise<T> {
  const res = await fetch(path, {
    method,
    headers: { 'content-type': 'application/json', ...(await authHeaders()) },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  if (res.status === 204) return undefined as T;
  const text = await res.text();
  const json = text ? (JSON.parse(text) as unknown) : null;
  if (!res.ok) {
    const err = (json as ApiErrorBody | null)?.error;
    throw new ApiError(res.status, err?.code ?? 'unknown', err?.message ?? `HTTP ${res.status}`, err?.details);
  }
  return json as T;
}

export const api = {
  rules: () => request<Rules>('GET', '/rules'),
  me: () => request<Me>('GET', '/me'),
  deleteMe: (confirm: string) =>
    request<{ deletedHost: boolean; deletedStudent: boolean; cancelledBookings: number }>('DELETE', '/me', { confirm }),

  // 公開
  hostBySlug: (slug: string) => request<PublicHost>('GET', `/hosts/by-slug/${encodeURIComponent(slug)}`),
  hostPublic: (hostId: string) => request<PublicHost>('GET', `/hosts/${hostId}/public`),
  slots: (hostId: string, from?: Date, to?: Date) => {
    const q = new URLSearchParams();
    if (from) q.set('from', from.toISOString());
    if (to) q.set('to', to.toISOString());
    const qs = q.toString();
    return request<{ slots: Slot[]; bookingHorizonDays: number }>('GET', `/hosts/${hostId}/slots${qs ? `?${qs}` : ''}`);
  },

  // 生徒
  createBooking: (hostId: string, startAt: string, note?: string) =>
    request<StudentBooking>('POST', '/bookings', { hostId, startAt, note: note || undefined }),
  myBookings: () => request<StudentBooking[]>('GET', '/bookings'),
  booking: (id: string) => request<StudentBooking & { changeRequests: ChangeRequest[] }>('GET', `/bookings/${id}`),
  change: (
    id: string,
    input: { kind: ChangeKind; message?: string; option?: LateChangeOption; proposedStartAt?: string },
  ) => request<ChangeOutcome>('POST', `/bookings/${id}/change`, input),

  // 主催者
  registerHost: (input: { displayName: string; slug?: string; bio?: string; timezone?: string; lessonMinutes?: number; minLeadMinutes?: number }) =>
    request<Host>('POST', '/hosts', input),
  updateHost: (
    hostId: string,
    patch: Partial<Pick<Host, 'displayName' | 'slug' | 'bio' | 'timezone' | 'lessonMinutes' | 'minLeadMinutes' | 'cancellationFeeAmount'>>,
  ) =>
    request<Host>('PATCH', `/hosts/${hostId}`, patch),
  connectStatus: (hostId: string) => request<ConnectStatus>('GET', `/hosts/${hostId}/connect`),
  connectOnboarding: (hostId: string, refreshUrl: string, returnUrl: string) =>
    request<{ url: string }>('POST', `/hosts/${hostId}/connect/onboarding`, { refreshUrl, returnUrl }),
  connectDisconnect: (hostId: string) => request<void>('DELETE', `/hosts/${hostId}/connect`),
  feeCheckout: (bookingId: string, successUrl: string, cancelUrl: string) =>
    request<{ url: string }>('POST', `/bookings/${bookingId}/fee-checkout`, { successUrl, cancelUrl }),
  // 教室
  orgBySlug: (slug: string) => request<PublicOrganization>('GET', `/orgs/by-slug/${encodeURIComponent(slug)}`),
  myOrganization: () => request<MyOrganization | null>('GET', '/me/organization'),
  myInvitations: () => request<MyInvitation[]>('GET', '/me/invitations'),
  acceptInvitation: (id: string) => request<Organization>('POST', `/invitations/${id}/accept`),
  declineInvitation: (id: string) => request<void>('POST', `/invitations/${id}/decline`),
  createOrg: (input: { name: string; slug: string; bio?: string }) => request<Organization>('POST', '/orgs', input),
  updateOrg: (id: string, patch: { name?: string; slug?: string; bio?: string }) => request<Organization>('PATCH', `/orgs/${id}`, patch),
  deleteOrg: (id: string) => request<void>('DELETE', `/orgs/${id}`),
  leaveOrg: () => request<void>('POST', '/me/organization/leave'),
  inviteToOrg: (id: string, email: string) => request<unknown>('POST', `/orgs/${id}/invitations`, { email }),
  revokeInvitation: (orgId: string, id: string) => request<void>('DELETE', `/orgs/${orgId}/invitations/${id}`),
  removeMember: (orgId: string, hostId: string) => request<void>('DELETE', `/orgs/${orgId}/members/${hostId}`),
  orgCheckout: (id: string, successUrl: string, cancelUrl: string) =>
    request<{ url: string }>('POST', `/orgs/${id}/billing/checkout`, { successUrl, cancelUrl }),
  orgPortal: (id: string, returnUrl: string) => request<{ url: string }>('POST', `/orgs/${id}/billing/portal`, { returnUrl }),

  billing: (hostId: string) => request<BillingInfo>('GET', `/hosts/${hostId}/billing`),
  checkout: (hostId: string, successUrl: string, cancelUrl: string) =>
    request<{ url: string }>('POST', `/hosts/${hostId}/billing/checkout`, { successUrl, cancelUrl }),
  billingPortal: (hostId: string, returnUrl: string) => request<{ url: string }>('POST', `/hosts/${hostId}/billing/portal`, { returnUrl }),
  calendars: (hostId: string) => request<HostCalendar[]>('GET', `/hosts/${hostId}/calendars`),
  addCalendar: (hostId: string, input: { calendarId: string; label?: string; role: HostCalendar['role'] }) =>
    request<HostCalendar>('POST', `/hosts/${hostId}/calendars`, input),
  removeCalendar: (hostId: string, id: string) => request<void>('DELETE', `/hosts/${hostId}/calendars/${id}`),
  windows: (hostId: string) => request<AvailabilityWindow[]>('GET', `/hosts/${hostId}/availability-windows`),
  addWindow: (hostId: string, input: { weekday: number; startTime: string; endTime: string }) =>
    request<AvailabilityWindow>('POST', `/hosts/${hostId}/availability-windows`, input),
  removeWindow: (hostId: string, id: string) => request<void>('DELETE', `/hosts/${hostId}/availability-windows/${id}`),
  hostBookings: (hostId: string) => request<HostBooking[]>('GET', `/hosts/${hostId}/bookings`),
  changeRequests: (hostId: string, status: 'pending' | 'approved' | 'rejected' | 'all' = 'pending') =>
    request<HostChangeRequest[]>('GET', `/hosts/${hostId}/change-requests?status=${status}`),
  decide: (hostId: string, id: string, decision: 'approve' | 'reject', note?: string) =>
    request<{ request: ChangeRequest; booking: HostBooking }>('POST', `/hosts/${hostId}/change-requests/${id}/decision`, {
      decision,
      note: note || undefined,
    }),
  cancelByHost: (hostId: string, bookingId: string, reason: string) =>
    request<HostBooking>('POST', `/hosts/${hostId}/bookings/${bookingId}/cancel`, { reason }),
  markFeePaid: (hostId: string, bookingId: string) => request<HostBooking>('POST', `/hosts/${hostId}/bookings/${bookingId}/fee-paid`),
  googleStatus: (hostId: string) => request<{ connected: boolean }>('GET', `/hosts/${hostId}/google/status`),
  googleConnectUrl: (hostId: string) => request<{ url: string }>('GET', `/hosts/${hostId}/google/connect`),
  googleDisconnect: (hostId: string) => request<void>('DELETE', `/hosts/${hostId}/google`),
};
