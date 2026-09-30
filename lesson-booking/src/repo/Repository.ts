import type {
  AvailabilityWindow,
  Booking,
  ChangeRequest,
  Host,
  HostCalendar,
  Student,
} from '../domain/types.js';

export interface HostRepository {
  create(input: Omit<Host, 'id' | 'createdAt'>): Promise<Host>;
  update(id: string, patch: Partial<Omit<Host, 'id' | 'createdAt'>>): Promise<Host>;
  findById(id: string): Promise<Host | null>;
  findByEmail(email: string): Promise<Host | null>;
  findBySlug(slug: string): Promise<Host | null>;
  findByStripeCustomerId(customerId: string): Promise<Host | null>;
  list(): Promise<Host[]>;
  /** 主催者と、その主催者に紐づく全データ(カレンダー設定・営業時間枠・予約・変更要求・Google 認可)を削除 */
  delete(id: string): Promise<void>;
}

export interface HostCalendarRepository {
  add(input: Omit<HostCalendar, 'id'>): Promise<HostCalendar>;
  remove(hostId: string, id: string): Promise<void>;
  listByHost(hostId: string): Promise<HostCalendar[]>;
}

export interface AvailabilityWindowRepository {
  add(input: Omit<AvailabilityWindow, 'id'>): Promise<AvailabilityWindow>;
  remove(hostId: string, id: string): Promise<void>;
  listByHost(hostId: string): Promise<AvailabilityWindow[]>;
}

export interface StudentRepository {
  findByEmail(email: string): Promise<Student | null>;
  findById(id: string): Promise<Student | null>;
  create(input: Omit<Student, 'id' | 'createdAt'>): Promise<Student>;
  /** 生徒と、その生徒の予約・変更要求を削除 */
  delete(id: string): Promise<void>;
}

export interface BookingRepository {
  create(input: Omit<Booking, 'id' | 'createdAt' | 'updatedAt'>): Promise<Booking>;
  update(id: string, patch: Partial<Omit<Booking, 'id' | 'createdAt'>>): Promise<Booking>;
  findById(id: string): Promise<Booking | null>;
  /** 指定期間に開始する主催者の確定予約 */
  listConfirmedByHost(hostId: string, from: Date, to: Date): Promise<Booking[]>;
  /** 指定期間に開始する主催者の確定予約数(プラン上限の判定用) */
  countConfirmedByHost(hostId: string, from: Date, to: Date): Promise<number>;
  listByStudent(studentId: string): Promise<Booking[]>;
  listByHost(hostId: string): Promise<Booking[]>;
}

export interface ChangeRequestRepository {
  create(input: Omit<ChangeRequest, 'id' | 'createdAt' | 'decidedAt'>): Promise<ChangeRequest>;
  update(id: string, patch: Partial<Omit<ChangeRequest, 'id' | 'createdAt'>>): Promise<ChangeRequest>;
  findById(id: string): Promise<ChangeRequest | null>;
  findPendingByBooking(bookingId: string): Promise<ChangeRequest | null>;
  listByHost(hostId: string, status?: ChangeRequest['status']): Promise<ChangeRequest[]>;
  listByBooking(bookingId: string): Promise<ChangeRequest[]>;
}

export interface GoogleCredentialStore {
  getRefreshToken(hostId: string): Promise<string | null>;
  saveRefreshToken(hostId: string, refreshToken: string): Promise<void>;
  clear(hostId: string): Promise<void>;
}

export interface Repositories {
  hosts: HostRepository;
  hostCalendars: HostCalendarRepository;
  availabilityWindows: AvailabilityWindowRepository;
  students: StudentRepository;
  bookings: BookingRepository;
  changeRequests: ChangeRequestRepository;
  googleCredentials: GoogleCredentialStore;
}
