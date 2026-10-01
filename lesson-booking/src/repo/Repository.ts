import type {
  AvailabilityWindow,
  Booking,
  ChangeRequest,
  Host,
  HostCalendar,
  Organization,
  OrgInvitation,
  Student,
} from '../shared/types.js';

export interface HostRepository {
  create(input: Omit<Host, 'id' | 'createdAt'>): Promise<Host>;
  update(id: string, patch: Partial<Omit<Host, 'id' | 'createdAt'>>): Promise<Host>;
  findById(id: string): Promise<Host | null>;
  findByEmail(email: string): Promise<Host | null>;
  findBySlug(slug: string): Promise<Host | null>;
  findByStripeCustomerId(customerId: string): Promise<Host | null>;
  findByConnectAccountId(accountId: string): Promise<Host | null>;
  listByOrganization(organizationId: string): Promise<Host[]>;
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
  findByIds(ids: readonly string[]): Promise<Student[]>;
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
  listByStudent(studentId: string, range?: BookingListRange): Promise<Booking[]>;
  /** 全主催者横断: [from, to) に開始する確定予約のうち、リマインド未送信のもの */
  listDueForReminder(from: Date, to: Date): Promise<Booking[]>;
  listByHost(hostId: string, range?: BookingListRange): Promise<Booking[]>;
}

/** 予約一覧の絞り込み。since 以降に開始する予約と、時期を問わずキャンセルフィー未払いの予約を返す */
export interface BookingListRange {
  since?: Date | undefined;
}

export interface ChangeRequestRepository {
  create(input: Omit<ChangeRequest, 'id' | 'createdAt' | 'decidedAt'>): Promise<ChangeRequest>;
  update(id: string, patch: Partial<Omit<ChangeRequest, 'id' | 'createdAt'>>): Promise<ChangeRequest>;
  findById(id: string): Promise<ChangeRequest | null>;
  findPendingByBooking(bookingId: string): Promise<ChangeRequest | null>;
  listByHost(hostId: string, status?: ChangeRequest['status']): Promise<ChangeRequest[]>;
  listByBookings(bookingIds: readonly string[]): Promise<ChangeRequest[]>;
}

export interface OrganizationRepository {
  create(input: Omit<Organization, 'id' | 'createdAt'>): Promise<Organization>;
  update(id: string, patch: Partial<Omit<Organization, 'id' | 'createdAt'>>): Promise<Organization>;
  findById(id: string): Promise<Organization | null>;
  findBySlug(slug: string): Promise<Organization | null>;
  findByStripeCustomerId(customerId: string): Promise<Organization | null>;
  /** 教室と招待を削除する。所属講師の organizationId の解除は呼び出し側で行う */
  delete(id: string): Promise<void>;
}

export interface OrgInvitationRepository {
  create(input: Omit<OrgInvitation, 'id' | 'createdAt' | 'respondedAt'>): Promise<OrgInvitation>;
  update(id: string, patch: Partial<Omit<OrgInvitation, 'id' | 'createdAt'>>): Promise<OrgInvitation>;
  findById(id: string): Promise<OrgInvitation | null>;
  listPendingByOrganization(organizationId: string): Promise<OrgInvitation[]>;
  listPendingByEmail(email: string): Promise<OrgInvitation[]>;
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
  organizations: OrganizationRepository;
  invitations: OrgInvitationRepository;
}
