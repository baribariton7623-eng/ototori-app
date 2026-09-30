import { FakeCalendarClient } from '../src/calendar/FakeCalendarClient.js';
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
  host: Host;
  student: Student;
}

/** 主催者(平日10:00-18:00 JST, 60分レッスン, 60分リード)と生徒を用意する */
export async function setupWorld(): Promise<TestWorld> {
  const clock = new FixedClock();
  const repos = createInMemoryRepositories(clock);
  const calendar = new FakeCalendarClient();
  const availability = new AvailabilityService(repos, calendar, clock);
  const bookings = new BookingService(repos, calendar, availability, clock);

  const host = await repos.hosts.create({
    email: 'teacher@example.com',
    displayName: '講師A',
    slug: 'teacher-a',
    bio: '',
    plan: 'pro',
    subscriptionStatus: 'active',
    stripeCustomerId: null,
    stripeSubscriptionId: null,
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
  return { clock, repos, calendar, availability, bookings, host, student };
}

/** JST のローカル日時を UTC Date に */
export function jst(dateTime: string): Date {
  return new Date(`${dateTime}+09:00`);
}
