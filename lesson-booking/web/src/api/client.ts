import { authHeaders } from './auth';
import type {
  ApiErrorBody,
  AvailabilityWindow,
  ChangeKind,
  ChangeOutcome,
  ChangeRequest,
  Host,
  HostBooking,
  HostCalendar,
  HostChangeRequest,
  LateChangeOption,
  Me,
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

  // 公開
  hosts: () => request<PublicHost[]>('GET', '/hosts'),
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
  registerHost: (input: { displayName: string; timezone?: string; lessonMinutes?: number; minLeadMinutes?: number }) =>
    request<Host>('POST', '/hosts', input),
  updateHost: (hostId: string, patch: Partial<Pick<Host, 'displayName' | 'timezone' | 'lessonMinutes' | 'minLeadMinutes'>>) =>
    request<Host>('PATCH', `/hosts/${hostId}`, patch),
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
  markFeePaid: (hostId: string, bookingId: string) => request<HostBooking>('POST', `/hosts/${hostId}/bookings/${bookingId}/fee-paid`),
  googleStatus: (hostId: string) => request<{ connected: boolean }>('GET', `/hosts/${hostId}/google/status`),
  googleConnectUrl: (hostId: string) => request<{ url: string }>('GET', `/hosts/${hostId}/google/connect`),
  googleDisconnect: (hostId: string) => request<void>('DELETE', `/hosts/${hostId}/google`),
};
