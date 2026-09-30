import { FakeBillingProvider } from '../src/billing/FakeBillingProvider.js';
import { FakeFeePaymentProvider } from '../src/billing/FakeFeePaymentProvider.js';
import { FeeService } from '../src/services/FeeService.js';
import { FakeCalendarClient } from '../src/calendar/FakeCalendarClient.js';
import { MemoryEmailSender } from '../src/notify/EmailSender.js';
import { EmailNotifier } from '../src/notify/EmailNotifier.js';
import { AccountService, type AccountCleanup } from '../src/services/AccountService.js';
import { BillingService } from '../src/services/BillingService.js';
import { ReminderService } from '../src/services/ReminderService.js';
import type { Host, Student, Weekday } from '../src/domain/types.js';
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
  host: Host;
  student: Student;
}

/** 主催者(平日10:00-18:00 JST, 60分レッスン, 60分リード)と生徒を用意する */
export async function setupWorld(): Promise<TestWorld> {
  const clock = new FixedClock();
  const repos = createInMemoryRepositories(clock);
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
  const accounts = new AccountService(repos, bookings, billing, cleanup, clock);
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
    timezone: 'Asia/Tokyo',
    lessonMinutes: 60,
    minLeadMinutes: 60,
  });
  for (const weekday of [1, 2, 3, 4, 5] as Weekday[]) {
    await repos.availabilityWindows.add({ hostId: host.id, weekday, startTime: '10:00', endTime: '18:00' });
  }
  await repos.hostCalendars.add({ hostId: host.id, calendarId: 'primary', label: 'メイン', role: 'write_target' });
  await repos.hostCalendars.add({ hostId: host.id, calendarId: 'private@group.calendar.google.com', label: '私用', role: 'busy_source' });

  const student = await repos.students.create({ email: 'student@example.com', name: '生徒B' });
  return { clock, repos, calendar, availability, bookings, mail, billingProvider, billing, cleanup, accounts, reminders, fees, host, student };
}

/** JST のローカル日時を UTC Date に */
export function jst(dateTime: string): Date {
  return new Date(`${dateTime}+09:00`);
}
