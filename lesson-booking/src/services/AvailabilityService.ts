import type { CalendarClient } from '../calendar/CalendarClient.js';
import { computeAvailableSlots } from '../domain/availability.js';
import { DomainError } from '../domain/errors.js';
import { bookingWindow } from '../domain/rules.js';
import type { AvailabilityWindow, BusyInterval, Host, Slot } from '../shared/types.js';
import type { Clock } from '../repo/InMemoryRepositories.js';
import type { Repositories } from '../repo/Repository.js';

export interface SlotQuery {
  /** 省略時は予約受付ウィンドウ全体 */
  from?: Date | undefined;
  to?: Date | undefined;
  /** 振替先の候補を出すとき、動かす予約自身を埋まっている枠に数えない */
  excludeBookingId?: string | undefined;
}

export interface SlotCheck {
  startAt: Date;
  /** 振替の判定では、動かす予約自身を埋まっている枠に数えない */
  excludeBookingId?: string | undefined;
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
    return this.computeSlots(host, from, to, query.excludeBookingId);
  }

  /** 指定枠が現在も空いているか(予約直前の再検証に使う) */
  async isSlotAvailable(host: Host, startAt: Date, excludeBookingId?: string): Promise<boolean> {
    const [ok] = await this.checkSlots(host, [{ startAt, excludeBookingId }]);
    return ok ?? false;
  }

  /**
   * 複数の枠が空いているかをまとめて確かめる。カレンダーと予約は全候補を含む範囲で 1 回だけ取得する
   * (承認待ち一覧で、候補ごとに Google へ問い合わせないため)
   */
  async checkSlots(host: Host, checks: readonly SlotCheck[]): Promise<boolean[]> {
    if (checks.length === 0) return [];
    const times = checks.map((c) => c.startAt.getTime());
    const busy = await this.loadBusy(host, new Date(Math.min(...times)), new Date(Math.max(...times)));
    return checks.map(({ startAt, excludeBookingId }) => {
      const endAt = new Date(startAt.getTime() + host.lessonMinutes * 60_000);
      const slots = computeAvailableSlots({
        windows: busy.windows,
        busy: busyExcluding(busy, excludeBookingId),
        timezone: host.timezone,
        lessonMinutes: host.lessonMinutes,
        from: startAt,
        to: startAt,
      });
      return slots.some((s) => s.startAt === startAt.toISOString() && s.endAt === endAt.toISOString());
    });
  }

  private async computeSlots(host: Host, from: Date, to: Date, excludeBookingId?: string): Promise<Slot[]> {
    const busy = await this.loadBusy(host, from, to);
    return computeAvailableSlots({
      windows: busy.windows,
      busy: busyExcluding(busy, excludeBookingId),
      timezone: host.timezone,
      lessonMinutes: host.lessonMinutes,
      from,
      to,
    });
  }

  /** 開始時刻が [from, to] の枠の判定に要る営業時間・カレンダーの予定・確定予約 */
  private async loadBusy(host: Host, from: Date, to: Date): Promise<LoadedBusy> {
    // to は「開始時刻の上限」なので、busy 取得はレッスン長ぶん先まで
    const busyTo = new Date(to.getTime() + host.lessonMinutes * 60_000);
    const [windows, calendars, bookings] = await Promise.all([
      this.repos.availabilityWindows.listByHost(host.id),
      this.repos.hostCalendars.listByHost(host.id),
      this.repos.bookings.listConfirmedByHost(host.id, from, busyTo),
    ]);
    const calendarIds = [...new Set(calendars.map((c) => c.calendarId))];
    const calendar: BusyInterval[] = calendarIds.length > 0 ? await this.calendar.freeBusy(host.id, calendarIds, from, busyTo) : [];
    return {
      windows,
      calendar,
      writeTarget: calendars.find((c) => c.role === 'write_target')?.calendarId ?? null,
      bookings: bookings.map((b) => ({ id: b.id, startAt: b.startAt, endAt: b.endAt, calendarEventId: b.calendarEventId })),
    };
  }
}

interface LoadedBusy {
  windows: AvailabilityWindow[];
  calendar: BusyInterval[];
  /** 予約を書き込むカレンダー(なければ null) */
  writeTarget: string | null;
  bookings: (BusyInterval & { id: string; calendarEventId: string | null })[];
}

/**
 * 埋まっている時間 = カレンダーの予定 ∪ 確定予約。excludeBookingId の予約(振替で動かす予約)は数えず、
 * その予約が書き込み先カレンダーに入れた予定も除く(除かないと、元の時間と重なる振替先(10:00 → 10:30 など)を選べない)
 */
function busyExcluding(busy: LoadedBusy, excludeBookingId: string | undefined): BusyInterval[] {
  const excluded = excludeBookingId ? busy.bookings.find((b) => b.id === excludeBookingId) : undefined;
  const calendar =
    excluded?.calendarEventId && busy.writeTarget
      ? busy.calendar.flatMap((b) => (b.calendarId === busy.writeTarget ? subtract(b, excluded) : [b]))
      : busy.calendar;
  return [...calendar, ...busy.bookings.filter((b) => b.id !== excludeBookingId)];
}

/** 予定あり区間 b から区間 cut を取り除いた残り(0〜2 区間) */
function subtract(b: BusyInterval, cut: { startAt: string; endAt: string }): BusyInterval[] {
  const [bs, be, cs, ce] = [b.startAt, b.endAt, cut.startAt, cut.endAt].map((t) => new Date(t).getTime()) as [number, number, number, number];
  if (ce <= bs || cs >= be) return [b];
  const out: BusyInterval[] = [];
  if (bs < cs) out.push({ ...b, endAt: new Date(cs).toISOString() });
  if (ce < be) out.push({ ...b, startAt: new Date(ce).toISOString() });
  return out;
}
