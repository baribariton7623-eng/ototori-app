import type { Server } from 'node:http';
import pg from 'pg';
import { inject } from 'vitest';
import { FakeBillingProvider } from '../src/billing/FakeBillingProvider.js';
import { createApp } from '../src/http/app.js';
import { createSupabaseRepositories } from '../src/repo/SupabaseRepositories.js';
import { FakeFeePaymentProvider } from '../src/billing/FakeFeePaymentProvider.js';
import { FeeService } from '../src/services/FeeService.js';
import { OrganizationService } from '../src/services/OrganizationService.js';
import { FakeCalendarClient } from '../src/calendar/FakeCalendarClient.js';
import { MemoryEmailSender } from '../src/notify/EmailSender.js';
import { EmailNotifier } from '../src/notify/EmailNotifier.js';
import { AccountService, type AccountCleanup } from '../src/services/AccountService.js';
import { BillingService } from '../src/services/BillingService.js';
import { ReminderService } from '../src/services/ReminderService.js';
import type { Booking, Host, Student, Weekday } from '../src/shared/types.js';
import { createInMemoryRepositories, type Clock } from '../src/repo/InMemoryRepositories.js';
import type { Repositories } from '../src/repo/Repository.js';
import { AvailabilityService } from '../src/services/AvailabilityService.js';
import { BookingService } from '../src/services/BookingService.js';

/** 2026-10-01 09:00 JST (木) を「今」とする固定時計 */
export const NOW = new Date('2026-10-01T00:00:00Z');

export class FixedClock implements Clock {
  constructor(public current: Date = NOW) {}
  now(): Date {
    return new Date(this.current);
  }
  advanceDays(days: number): void {
    this.current = new Date(this.current.getTime() + days * 86_400_000);
  }
}

export interface TestWorld {
  clock: FixedClock;
  repos: Repositories;
  calendar: FakeCalendarClient;
  availability: AvailabilityService;
  bookings: BookingService;
  mail: MemoryEmailSender;
  billingProvider: FakeBillingProvider;
  billing: BillingService;
  cleanup: AccountCleanup & { revoked: string[]; deletedAuthUsers: string[] };
  accounts: AccountService;
  reminders: ReminderService;
  fees: FeeService;
  organizations: OrganizationService;
  host: Host;
  student: Student;
}

/** 主催者(平日10:00-18:00 JST, 60分レッスン, 60分リード)と生徒を用意する */
export async function setupWorld(): Promise<TestWorld> {
  const clock = new FixedClock();
  const repos = await createRepositories(clock);
  const calendar = new FakeCalendarClient();
  const availability = new AvailabilityService(repos, calendar, clock);
  const mail = new MemoryEmailSender();
  const notifier = new EmailNotifier(mail, { serviceName: 'テスト予約', appBaseUrl: 'https://app.example.com' });
  const bookings = new BookingService(repos, calendar, availability, clock, notifier);
  const billingProvider = new FakeBillingProvider('https://app.example.com');
  const billing = new BillingService(repos, billingProvider);
  const revoked: string[] = [];
  const deletedAuthUsers: string[] = [];
  const cleanup = {
    revoked,
    deletedAuthUsers,
    async revokeGoogle(hostId: string) {
      revoked.push(hostId);
      await repos.googleCredentials.clear(hostId);
    },
    async deleteAuthUser(subject: string) {
      deletedAuthUsers.push(subject);
    },
  };
  const organizations = new OrganizationService(repos, billing, notifier, clock);
  const accounts = new AccountService(repos, bookings, billing, cleanup, clock, organizations);
  const reminders = new ReminderService(repos, notifier, clock, 24);
  const fees = new FeeService(repos, new FakeFeePaymentProvider('https://app.example.com'), notifier);

  const host = await repos.hosts.create({
    email: 'teacher@example.com',
    displayName: '講師A',
    slug: 'teacher-a',
    bio: '',
    plan: 'pro',
    subscriptionStatus: 'active',
    stripeCustomerId: null,
    stripeSubscriptionId: null,
    cancellationFeeAmount: 3000,
    stripeConnectAccountId: null,
    connectChargesEnabled: false,
    feeMethods: ['bank_transfer', 'in_person', 'card'],
    bankTransferInfo: '',
    organizationId: null,
    orgPlanActive: false,
    timezone: 'Asia/Tokyo',
    lessonMinutes: 60,
    rescheduleRangeDays: 7,
    lateChangeThresholdDays: 14,
    bookingHorizonDays: 40,
    minLeadMinutes: 60,
  });
  for (const weekday of [1, 2, 3, 4, 5] as Weekday[]) {
    await repos.availabilityWindows.add({ hostId: host.id, weekday, startTime: '10:00', endTime: '18:00' });
  }
  await repos.hostCalendars.add({ hostId: host.id, calendarId: 'primary', label: 'メイン', role: 'write_target' });
  await repos.hostCalendars.add({ hostId: host.id, calendarId: 'private@group.calendar.google.com', label: '私用', role: 'busy_source' });

  const student = await repos.students.create({ email: 'student@example.com', name: '生徒B' });
  return { clock, repos, calendar, availability, bookings, mail, billingProvider, billing, cleanup, accounts, reminders, fees, organizations, host, student };
}

/** JST のローカル日時を UTC Date に */
export function jst(dateTime: string): Date {
  return new Date(`${dateTime}+09:00`);
}

/** 全テーブル(npm run test:db で実 DB を使うとき、各テストの前に空にする) */
const TABLES = [
  'lb_org_invitations',
  'lb_change_requests',
  'lb_bookings',
  'lb_availability_windows',
  'lb_host_calendars',
  'lb_host_google_credentials',
  'lb_students',
  'lb_organizations',
  'lb_hosts',
];

/**
 * 既定はインメモリ。TEST_REPOS=supabase(vitest.db.config.ts)なら実 PostgreSQL + PostgREST 上の Supabase 実装を使う
 */
export async function createRepositories(clock: Clock): Promise<Repositories> {
  if (process.env.TEST_REPOS !== 'supabase') return createInMemoryRepositories(clock);
  const db = new pg.Client({ connectionString: inject('databaseUrl') });
  await db.connect();
  // lb_organizations.owner_host_id → lb_hosts、lb_hosts.organization_id → lb_organizations の相互参照があるので cascade
  await db.query(`truncate ${TABLES.join(', ')} cascade`);
  await db.end();
  return createSupabaseRepositories(inject('supabaseUrl'), inject('supabaseServiceKey'));
}

export interface TestApi {
  call(method: string, path: string, headers: Record<string, string>, body?: unknown): Promise<{ status: number; json: any }>;
  close(): Promise<void>;
}

/** setupWorld の部品で HTTP サーバーを起動する(AUTH_MODE=dev、ヘッダでログイン) */
export async function startApi(w: TestWorld): Promise<TestApi> {
  const app = createApp({
    repos: w.repos,
    calendar: w.calendar,
    availability: w.availability,
    bookings: w.bookings,
    billing: w.billing,
    accounts: w.accounts,
    reminders: w.reminders,
    fees: w.fees,
    organizations: w.organizations,
    cronSecret: 'cron-test-secret',
    fakeBilling: true,
    clock: w.clock,
    auth: { mode: 'dev' },
    defaultTimezone: 'Asia/Tokyo',
    appBaseUrl: 'http://localhost',
  });
  const server = await new Promise<Server>((resolve) => {
    const s = app.listen(0, '127.0.0.1', () => resolve(s));
  });
  const addr = server.address();
  if (!addr || typeof addr === 'string') throw new Error('no port');
  const base = `http://127.0.0.1:${addr.port}`;
  return {
    async call(method, path, headers, body) {
      const res = await fetch(base + path, {
        method,
        headers: { 'content-type': 'application/json', ...headers },
        body: body === undefined ? undefined : JSON.stringify(body),
      });
      const text = await res.text();
      return { status: res.status, json: text ? JSON.parse(text) : null };
    },
    close: () => new Promise<void>((resolve) => server.close(() => resolve())),
  };
}

/** dev 認証のログインヘッダ */
export function devUser(email: string, name: string): Record<string, string> {
  return { 'x-dev-user-email': email, 'x-dev-user-name': encodeURIComponent(name) };
}

/** 予約を直接 DB に入れる(サービスの検証を通さずに状態を作るため)。既定は w.host・w.student の 60 分の確定予約 */
export function insertBooking(w: TestWorld, startAt: Date, overrides: Partial<Omit<Booking, 'id' | 'createdAt' | 'updatedAt'>> = {}): Promise<Booking> {
  return w.repos.bookings.create({
    hostId: w.host.id,
    studentId: w.student.id,
    startAt: startAt.toISOString(),
    endAt: new Date(startAt.getTime() + 60 * 60_000).toISOString(),
    status: 'confirmed',
    calendarEventId: null,
    note: null,
    cancellationFeeStatus: 'none',
    cancellationFeeAmount: null,
    cancellationFeeMethod: null,
    reminderSentAt: null,
    ...overrides,
  });
}
