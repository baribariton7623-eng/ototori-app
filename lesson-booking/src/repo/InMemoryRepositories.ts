import { randomUUID } from 'node:crypto';
import { DomainError } from '../domain/errors.js';
import type {
  AvailabilityWindow,
  Booking,
  ChangeRequest,
  Host,
  HostCalendar,
  Student,
} from '../domain/types.js';
import type {
  AvailabilityWindowRepository,
  BookingRepository,
  ChangeRequestRepository,
  GoogleCredentialStore,
  HostCalendarRepository,
  HostRepository,
  Repositories,
  StudentRepository,
} from './Repository.js';

export interface Clock {
  now(): Date;
}

export const systemClock: Clock = { now: () => new Date() };

class Table<T extends { id: string }> {
  readonly rows = new Map<string, T>();
  insert(row: Omit<T, 'id'> & Partial<Pick<T, 'id'>>): T {
    const id = row.id ?? randomUUID();
    const full = { ...row, id } as T;
    this.rows.set(id, full);
    return full;
  }
  patch(id: string, patch: Partial<T>, label: string): T {
    const cur = this.rows.get(id);
    if (!cur) throw new DomainError('not_found', `${label}が見つかりません`, { id });
    const next = { ...cur, ...patch };
    this.rows.set(id, next);
    return next;
  }
  all(): T[] {
    return [...this.rows.values()];
  }
}

export function createInMemoryRepositories(clock: Clock = systemClock): Repositories {
  const hosts = new Table<Host>();
  const calendars = new Table<HostCalendar>();
  const windows = new Table<AvailabilityWindow>();
  const students = new Table<Student>();
  const bookings = new Table<Booking>();
  const changes = new Table<ChangeRequest>();
  const tokens = new Map<string, string>();

  const hostRepo: HostRepository = {
    async create(input) {
      return hosts.insert({ ...input, createdAt: clock.now().toISOString() });
    },
    async update(id, patch) {
      return hosts.patch(id, patch, '主催者');
    },
    async findById(id) {
      return hosts.rows.get(id) ?? null;
    },
    async findByEmail(email) {
      const e = email.toLowerCase();
      return hosts.all().find((h) => h.email.toLowerCase() === e) ?? null;
    },
    async findBySlug(slug) {
      return hosts.all().find((h) => h.slug === slug) ?? null;
    },
    async findByStripeCustomerId(customerId) {
      return hosts.all().find((h) => h.stripeCustomerId === customerId) ?? null;
    },
    async list() {
      return hosts.all();
    },
    async delete(id) {
      hosts.rows.delete(id);
      for (const c of calendars.all()) if (c.hostId === id) calendars.rows.delete(c.id);
      for (const w of windows.all()) if (w.hostId === id) windows.rows.delete(w.id);
      for (const b of bookings.all()) if (b.hostId === id) bookings.rows.delete(b.id);
      for (const c of changes.all()) if (c.hostId === id) changes.rows.delete(c.id);
      tokens.delete(id);
    },
  };

  const calendarRepo: HostCalendarRepository = {
    async add(input) {
      return calendars.insert(input);
    },
    async remove(hostId, id) {
      const row = calendars.rows.get(id);
      if (row && row.hostId === hostId) calendars.rows.delete(id);
    },
    async listByHost(hostId) {
      return calendars.all().filter((c) => c.hostId === hostId);
    },
  };

  const windowRepo: AvailabilityWindowRepository = {
    async add(input) {
      return windows.insert(input);
    },
    async remove(hostId, id) {
      const row = windows.rows.get(id);
      if (row && row.hostId === hostId) windows.rows.delete(id);
    },
    async listByHost(hostId) {
      return windows.all().filter((w) => w.hostId === hostId);
    },
  };

  const studentRepo: StudentRepository = {
    async findByEmail(email) {
      const e = email.toLowerCase();
      return students.all().find((s) => s.email.toLowerCase() === e) ?? null;
    },
    async findById(id) {
      return students.rows.get(id) ?? null;
    },
    async create(input) {
      return students.insert({ ...input, createdAt: clock.now().toISOString() });
    },
    async delete(id) {
      students.rows.delete(id);
      for (const b of bookings.all()) if (b.studentId === id) bookings.rows.delete(b.id);
      for (const c of changes.all()) if (c.studentId === id) changes.rows.delete(c.id);
    },
  };

  const bookingRepo: BookingRepository = {
    async create(input) {
      const now = clock.now().toISOString();
      return bookings.insert({ ...input, createdAt: now, updatedAt: now });
    },
    async update(id, patch) {
      return bookings.patch(id, { ...patch, updatedAt: clock.now().toISOString() }, '予約');
    },
    async findById(id) {
      return bookings.rows.get(id) ?? null;
    },
    async listConfirmedByHost(hostId, from, to) {
      const f = from.getTime();
      const t = to.getTime();
      return bookings
        .all()
        .filter((b) => b.hostId === hostId && b.status === 'confirmed')
        .filter((b) => {
          const s = new Date(b.startAt).getTime();
          const e = new Date(b.endAt).getTime();
          return e > f && s < t;
        })
        .sort((a, b) => a.startAt.localeCompare(b.startAt));
    },
    async countConfirmedByHost(hostId, from, to) {
      return (await this.listConfirmedByHost(hostId, from, to)).length;
    },
    async listByStudent(studentId) {
      return bookings
        .all()
        .filter((b) => b.studentId === studentId)
        .sort((a, b) => a.startAt.localeCompare(b.startAt));
    },
    async listByHost(hostId) {
      return bookings
        .all()
        .filter((b) => b.hostId === hostId)
        .sort((a, b) => a.startAt.localeCompare(b.startAt));
    },
  };

  const changeRepo: ChangeRequestRepository = {
    async create(input) {
      return changes.insert({ ...input, createdAt: clock.now().toISOString(), decidedAt: null });
    },
    async update(id, patch) {
      return changes.patch(id, patch, '変更要求');
    },
    async findById(id) {
      return changes.rows.get(id) ?? null;
    },
    async findPendingByBooking(bookingId) {
      return changes.all().find((c) => c.bookingId === bookingId && c.status === 'pending') ?? null;
    },
    async listByHost(hostId, status) {
      return changes
        .all()
        .filter((c) => c.hostId === hostId && (status ? c.status === status : true))
        .sort((a, b) => a.createdAt.localeCompare(b.createdAt));
    },
    async listByBooking(bookingId) {
      return changes
        .all()
        .filter((c) => c.bookingId === bookingId)
        .sort((a, b) => a.createdAt.localeCompare(b.createdAt));
    },
  };

  const credentialStore: GoogleCredentialStore = {
    async getRefreshToken(hostId) {
      return tokens.get(hostId) ?? null;
    },
    async saveRefreshToken(hostId, refreshToken) {
      tokens.set(hostId, refreshToken);
    },
    async clear(hostId) {
      tokens.delete(hostId);
    },
  };

  return {
    hosts: hostRepo,
    hostCalendars: calendarRepo,
    availabilityWindows: windowRepo,
    students: studentRepo,
    bookings: bookingRepo,
    changeRequests: changeRepo,
    googleCredentials: credentialStore,
  };
}
