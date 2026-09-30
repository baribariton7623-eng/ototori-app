import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { DomainError } from '../domain/errors.js';
import type {
  AvailabilityWindow,
  Booking,
  ChangeRequest,
  Host,
  HostCalendar,
  Student,
} from '../domain/types.js';
import type { Repositories } from './Repository.js';

/**
 * Supabase(Postgres) 実装。service role key で接続し、認可はアプリ層で行う。
 * 列名は snake_case、ドメイン型は camelCase なので相互変換する。
 */
export function createSupabaseRepositories(url: string, serviceRoleKey: string): Repositories {
  const sb = createClient(url, serviceRoleKey, { auth: { persistSession: false } });
  return buildRepositories(sb);
}

type Row = Record<string, unknown>;

function must<T>(res: { data: T | null; error: { message: string } | null }, label: string): T {
  if (res.error) throw new DomainError('validation', `${label}: ${res.error.message}`);
  if (res.data === null) throw new DomainError('not_found', `${label}が見つかりません`);
  return res.data;
}

function maybe<T>(res: { data: T | null; error: { message: string } | null }, label: string): T | null {
  if (res.error) throw new DomainError('validation', `${label}: ${res.error.message}`);
  return res.data;
}

const hostFromRow = (r: Row): Host => ({
  id: r.id as string,
  email: r.email as string,
  displayName: r.display_name as string,
  slug: r.slug as string,
  bio: (r.bio as string | null) ?? '',
  plan: (r.plan as Host['plan'] | null) ?? 'free',
  subscriptionStatus: (r.subscription_status as Host['subscriptionStatus'] | null) ?? 'none',
  stripeCustomerId: (r.stripe_customer_id as string | null) ?? null,
  stripeSubscriptionId: (r.stripe_subscription_id as string | null) ?? null,
  timezone: r.timezone as string,
  lessonMinutes: r.lesson_minutes as number,
  minLeadMinutes: r.min_lead_minutes as number,
  createdAt: r.created_at as string,
});
const hostToRow = (h: Partial<Host>): Row => strip({
  email: h.email,
  display_name: h.displayName,
  slug: h.slug,
  bio: h.bio,
  plan: h.plan,
  subscription_status: h.subscriptionStatus,
  stripe_customer_id: h.stripeCustomerId,
  stripe_subscription_id: h.stripeSubscriptionId,
  timezone: h.timezone,
  lesson_minutes: h.lessonMinutes,
  min_lead_minutes: h.minLeadMinutes,
});

const calendarFromRow = (r: Row): HostCalendar => ({
  id: r.id as string,
  hostId: r.host_id as string,
  calendarId: r.calendar_id as string,
  label: r.label as string,
  role: r.role as HostCalendar['role'],
});

const windowFromRow = (r: Row): AvailabilityWindow => ({
  id: r.id as string,
  hostId: r.host_id as string,
  weekday: r.weekday as AvailabilityWindow['weekday'],
  startTime: r.start_time as string,
  endTime: r.end_time as string,
});

const studentFromRow = (r: Row): Student => ({
  id: r.id as string,
  email: r.email as string,
  name: r.name as string,
  createdAt: r.created_at as string,
});

const bookingFromRow = (r: Row): Booking => ({
  id: r.id as string,
  hostId: r.host_id as string,
  studentId: r.student_id as string,
  startAt: r.start_at as string,
  endAt: r.end_at as string,
  status: r.status as Booking['status'],
  calendarEventId: (r.calendar_event_id as string | null) ?? null,
  note: (r.note as string | null) ?? null,
  cancellationFeeStatus: r.cancellation_fee_status as Booking['cancellationFeeStatus'],
  reminderSentAt: (r.reminder_sent_at as string | null) ?? null,
  createdAt: r.created_at as string,
  updatedAt: r.updated_at as string,
});
const bookingToRow = (b: Partial<Booking>): Row => strip({
  host_id: b.hostId,
  student_id: b.studentId,
  start_at: b.startAt,
  end_at: b.endAt,
  status: b.status,
  calendar_event_id: b.calendarEventId,
  note: b.note,
  cancellation_fee_status: b.cancellationFeeStatus,
  reminder_sent_at: b.reminderSentAt,
  updated_at: b.updatedAt,
});

const changeFromRow = (r: Row): ChangeRequest => ({
  id: r.id as string,
  bookingId: r.booking_id as string,
  hostId: r.host_id as string,
  studentId: r.student_id as string,
  kind: r.kind as ChangeRequest['kind'],
  option: r.option as ChangeRequest['option'],
  message: r.message as string,
  proposedStartAt: (r.proposed_start_at as string | null) ?? null,
  status: r.status as ChangeRequest['status'],
  decisionNote: (r.decision_note as string | null) ?? null,
  createdAt: r.created_at as string,
  decidedAt: (r.decided_at as string | null) ?? null,
});
const changeToRow = (c: Partial<ChangeRequest>): Row => strip({
  booking_id: c.bookingId,
  host_id: c.hostId,
  student_id: c.studentId,
  kind: c.kind,
  option: c.option,
  message: c.message,
  proposed_start_at: c.proposedStartAt,
  status: c.status,
  decision_note: c.decisionNote,
  decided_at: c.decidedAt,
});

function strip(row: Row): Row {
  const out: Row = {};
  for (const [k, v] of Object.entries(row)) if (v !== undefined) out[k] = v;
  return out;
}

function buildRepositories(sb: SupabaseClient): Repositories {
  return {
    hosts: {
      async create(input) {
        return hostFromRow(must(await sb.from('lb_hosts').insert(hostToRow(input)).select().single<Row>(), '主催者作成'));
      },
      async update(id, patch) {
        return hostFromRow(must(await sb.from('lb_hosts').update(hostToRow(patch)).eq('id', id).select().single<Row>(), '主催者更新'));
      },
      async findById(id) {
        const r = maybe(await sb.from('lb_hosts').select().eq('id', id).maybeSingle<Row>(), '主催者');
        return r ? hostFromRow(r) : null;
      },
      async findByEmail(email) {
        const r = maybe(await sb.from('lb_hosts').select().ilike('email', email).maybeSingle<Row>(), '主催者');
        return r ? hostFromRow(r) : null;
      },
      async findBySlug(slug) {
        const r = maybe(await sb.from('lb_hosts').select().eq('slug', slug).maybeSingle<Row>(), '主催者');
        return r ? hostFromRow(r) : null;
      },
      async findByStripeCustomerId(customerId) {
        const r = maybe(await sb.from('lb_hosts').select().eq('stripe_customer_id', customerId).maybeSingle<Row>(), '主催者');
        return r ? hostFromRow(r) : null;
      },
      async list() {
        return must(await sb.from('lb_hosts').select().returns<Row[]>(), '主催者一覧').map(hostFromRow);
      },
      async delete(id) {
        // 関連テーブルは on delete cascade
        maybe(await sb.from('lb_hosts').delete().eq('id', id), '主催者削除');
      },
    },
    hostCalendars: {
      async add(input) {
        const row = { host_id: input.hostId, calendar_id: input.calendarId, label: input.label, role: input.role };
        return calendarFromRow(must(await sb.from('lb_host_calendars').insert(row).select().single<Row>(), 'カレンダー追加'));
      },
      async remove(hostId, id) {
        maybe(await sb.from('lb_host_calendars').delete().eq('id', id).eq('host_id', hostId), 'カレンダー削除');
      },
      async listByHost(hostId) {
        return must(await sb.from('lb_host_calendars').select().eq('host_id', hostId).returns<Row[]>(), 'カレンダー一覧').map(calendarFromRow);
      },
    },
    availabilityWindows: {
      async add(input) {
        const row = { host_id: input.hostId, weekday: input.weekday, start_time: input.startTime, end_time: input.endTime };
        return windowFromRow(must(await sb.from('lb_availability_windows').insert(row).select().single<Row>(), '営業時間枠追加'));
      },
      async remove(hostId, id) {
        maybe(await sb.from('lb_availability_windows').delete().eq('id', id).eq('host_id', hostId), '営業時間枠削除');
      },
      async listByHost(hostId) {
        return must(await sb.from('lb_availability_windows').select().eq('host_id', hostId).returns<Row[]>(), '営業時間枠一覧').map(windowFromRow);
      },
    },
    students: {
      async findByEmail(email) {
        const r = maybe(await sb.from('lb_students').select().ilike('email', email).maybeSingle<Row>(), '生徒');
        return r ? studentFromRow(r) : null;
      },
      async findById(id) {
        const r = maybe(await sb.from('lb_students').select().eq('id', id).maybeSingle<Row>(), '生徒');
        return r ? studentFromRow(r) : null;
      },
      async create(input) {
        return studentFromRow(must(await sb.from('lb_students').insert({ email: input.email, name: input.name }).select().single<Row>(), '生徒作成'));
      },
      async delete(id) {
        maybe(await sb.from('lb_students').delete().eq('id', id), '生徒削除');
      },
    },
    bookings: {
      async create(input) {
        const res = await sb.from('lb_bookings').insert(bookingToRow(input)).select().single<Row>();
        if (res.error?.code === '23505') {
          throw new DomainError('slot_unavailable', 'この枠は直前に他の予約で埋まりました');
        }
        return bookingFromRow(must(res, '予約作成'));
      },
      async update(id, patch) {
        const res = await sb.from('lb_bookings').update({ ...bookingToRow(patch), updated_at: new Date().toISOString() }).eq('id', id).select().single<Row>();
        if (res.error?.code === '23505') {
          throw new DomainError('slot_unavailable', 'この枠は直前に他の予約で埋まりました');
        }
        return bookingFromRow(must(res, '予約更新'));
      },
      async findById(id) {
        const r = maybe(await sb.from('lb_bookings').select().eq('id', id).maybeSingle<Row>(), '予約');
        return r ? bookingFromRow(r) : null;
      },
      async listConfirmedByHost(hostId, from, to) {
        const rows = must(
          await sb
            .from('lb_bookings')
            .select()
            .eq('host_id', hostId)
            .eq('status', 'confirmed')
            .gt('end_at', from.toISOString())
            .lt('start_at', to.toISOString())
            .order('start_at')
            .returns<Row[]>(),
          '予約一覧',
        );
        return rows.map(bookingFromRow);
      },
      async listDueForReminder(from, to) {
        const rows = must(
          await sb
            .from('lb_bookings')
            .select()
            .eq('status', 'confirmed')
            .is('reminder_sent_at', null)
            .gte('start_at', from.toISOString())
            .lt('start_at', to.toISOString())
            .order('start_at')
            .returns<Row[]>(),
          'リマインド対象',
        );
        return rows.map(bookingFromRow);
      },
      async countConfirmedByHost(hostId, from, to) {
        const res = await sb
          .from('lb_bookings')
          .select('id', { count: 'exact', head: true })
          .eq('host_id', hostId)
          .eq('status', 'confirmed')
          .gte('start_at', from.toISOString())
          .lt('start_at', to.toISOString());
        if (res.error) throw new DomainError('validation', `予約数取得: ${res.error.message}`);
        return res.count ?? 0;
      },
      async listByStudent(studentId) {
        return must(await sb.from('lb_bookings').select().eq('student_id', studentId).order('start_at').returns<Row[]>(), '予約一覧').map(bookingFromRow);
      },
      async listByHost(hostId) {
        return must(await sb.from('lb_bookings').select().eq('host_id', hostId).order('start_at').returns<Row[]>(), '予約一覧').map(bookingFromRow);
      },
    },
    changeRequests: {
      async create(input) {
        const res = await sb.from('lb_change_requests').insert(changeToRow(input)).select().single<Row>();
        if (res.error?.code === '23505') {
          throw new DomainError('change_request_pending', 'この予約には承認待ちの変更要求があります');
        }
        return changeFromRow(must(res, '変更要求作成'));
      },
      async update(id, patch) {
        return changeFromRow(must(await sb.from('lb_change_requests').update(changeToRow(patch)).eq('id', id).select().single<Row>(), '変更要求更新'));
      },
      async findById(id) {
        const r = maybe(await sb.from('lb_change_requests').select().eq('id', id).maybeSingle<Row>(), '変更要求');
        return r ? changeFromRow(r) : null;
      },
      async findPendingByBooking(bookingId) {
        const r = maybe(await sb.from('lb_change_requests').select().eq('booking_id', bookingId).eq('status', 'pending').maybeSingle<Row>(), '変更要求');
        return r ? changeFromRow(r) : null;
      },
      async listByHost(hostId, status) {
        let q = sb.from('lb_change_requests').select().eq('host_id', hostId);
        if (status) q = q.eq('status', status);
        return must(await q.order('created_at').returns<Row[]>(), '変更要求一覧').map(changeFromRow);
      },
      async listByBooking(bookingId) {
        return must(await sb.from('lb_change_requests').select().eq('booking_id', bookingId).order('created_at').returns<Row[]>(), '変更要求一覧').map(changeFromRow);
      },
    },
    googleCredentials: {
      async getRefreshToken(hostId) {
        const r = maybe(await sb.from('lb_host_google_credentials').select('refresh_token').eq('host_id', hostId).maybeSingle<Row>(), 'Google認可');
        return r ? (r.refresh_token as string) : null;
      },
      async saveRefreshToken(hostId, refreshToken) {
        must(
          await sb.from('lb_host_google_credentials').upsert({ host_id: hostId, refresh_token: refreshToken, updated_at: new Date().toISOString() }).select().single<Row>(),
          'Google認可保存',
        );
      },
      async clear(hostId) {
        maybe(await sb.from('lb_host_google_credentials').delete().eq('host_id', hostId), 'Google認可削除');
      },
    },
  };
}
