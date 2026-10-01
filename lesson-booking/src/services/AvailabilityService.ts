import type { CalendarClient } from '../calendar/CalendarClient.js';
import { computeAvailableSlots } from '../domain/availability.js';
import { DomainError } from '../domain/errors.js';
import { bookingWindow } from '../domain/rules.js';
import type { BusyInterval, Host, Slot } from '../domain/types.js';
import type { Clock } from '../repo/InMemoryRepositories.js';
import type { Repositories } from '../repo/Repository.js';

export interface SlotQuery {
  /** 省略時は予約受付ウィンドウ全体 */
  from?: Date | undefined;
  to?: Date | undefined;
}

/**
 * 空き枠 = 営業時間枠 − (連携カレンダー全体の busy ∪ 既存の確定予約)。
 * 予約受付ウィンドウ(今+minLead 〜 今+40日)の外は返さない。
 */
export class AvailabilityService {
  constructor(
    private readonly repos: Repositories,
    private readonly calendar: CalendarClient,
    private readonly clock: Clock,
  ) {}

  async getHost(hostId: string): Promise<Host> {
    const host = await this.repos.hosts.findById(hostId);
    if (!host) throw new DomainError('not_found', '主催者が見つかりません', { hostId });
    return host;
  }

  async listSlots(hostId: string, query: SlotQuery = {}): Promise<Slot[]> {
    const host = await this.getHost(hostId);
    const now = this.clock.now();
    const win = bookingWindow(now, host.minLeadMinutes, host.bookingHorizonDays);
    const from = query.from && query.from > win.from ? query.from : win.from;
    const to = query.to && query.to < win.to ? query.to : win.to;
    if (from > to) return [];
    return this.computeSlots(host, from, to);
  }

  /** 指定枠が現在も空いているか(予約直前の再検証に使う) */
  async isSlotAvailable(host: Host, startAt: Date, excludeBookingId?: string): Promise<boolean> {
    const endAt = new Date(startAt.getTime() + host.lessonMinutes * 60_000);
    const slots = await this.computeSlots(host, startAt, startAt, excludeBookingId);
    return slots.some((s) => s.startAt === startAt.toISOString() && s.endAt === endAt.toISOString());
  }

  private async computeSlots(host: Host, from: Date, to: Date, excludeBookingId?: string): Promise<Slot[]> {
    // to は「開始時刻の上限」なので、busy 取得はレッスン長ぶん先まで
    const busyTo = new Date(to.getTime() + host.lessonMinutes * 60_000);
    const [windows, calendars, bookings] = await Promise.all([
      this.repos.availabilityWindows.listByHost(host.id),
      this.repos.hostCalendars.listByHost(host.id),
      this.repos.bookings.listConfirmedByHost(host.id, from, busyTo),
    ]);
    const calendarIds = [...new Set(calendars.map((c) => c.calendarId))];
    const calendarBusy = calendarIds.length > 0 ? await this.calendar.freeBusy(host.id, calendarIds, from, busyTo) : [];
    const bookingBusy: BusyInterval[] = bookings
      .filter((b) => b.id !== excludeBookingId)
      .map((b) => ({ startAt: b.startAt, endAt: b.endAt }));

    return computeAvailableSlots({
      windows,
      busy: [...calendarBusy, ...bookingBusy],
      timezone: host.timezone,
      lessonMinutes: host.lessonMinutes,
      from,
      to,
    });
  }
}
