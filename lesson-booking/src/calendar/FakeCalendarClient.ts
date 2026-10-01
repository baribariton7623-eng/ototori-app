import type { BusyInterval } from '../shared/types.js';
import type { CalendarClient, CalendarEventInput } from './CalendarClient.js';

interface StoredEvent extends CalendarEventInput {
  eventId: string;
}

/**
 * Google を呼ばないインメモリのカレンダー。
 * - seedBusy() で任意の予定あり区間を差し込める(テスト用)
 * - createEvent で作ったイベントは以後 freeBusy に反映される
 */
export class FakeCalendarClient implements CalendarClient {
  private readonly busy = new Map<string, BusyInterval[]>(); // key: calendarId
  private readonly events = new Map<string, StoredEvent>(); // key: eventId
  private seq = 0;

  seedBusy(calendarId: string, intervals: BusyInterval[]): void {
    const list = this.busy.get(calendarId) ?? [];
    list.push(...intervals);
    this.busy.set(calendarId, list);
  }

  listEvents(): StoredEvent[] {
    return [...this.events.values()];
  }

  async freeBusy(_hostId: string, calendarIds: readonly string[], from: Date, to: Date): Promise<BusyInterval[]> {
    const out: BusyInterval[] = [];
    const f = from.getTime();
    const t = to.getTime();
    for (const id of calendarIds) {
      for (const b of this.busy.get(id) ?? []) {
        if (new Date(b.endAt).getTime() > f && new Date(b.startAt).getTime() < t) out.push(b);
      }
      for (const ev of this.events.values()) {
        if (ev.calendarId !== id) continue;
        if (new Date(ev.endAt).getTime() > f && new Date(ev.startAt).getTime() < t) {
          out.push({ startAt: ev.startAt, endAt: ev.endAt });
        }
      }
    }
    return out;
  }

  async createEvent(_hostId: string, input: CalendarEventInput): Promise<{ eventId: string }> {
    const eventId = `fake-event-${++this.seq}`;
    this.events.set(eventId, { ...input, eventId });
    return { eventId };
  }

  async updateEvent(
    _hostId: string,
    _calendarId: string,
    eventId: string,
    patch: Pick<CalendarEventInput, 'startAt' | 'endAt' | 'timezone'>,
  ): Promise<void> {
    const ev = this.events.get(eventId);
    if (ev) this.events.set(eventId, { ...ev, ...patch });
  }

  async deleteEvent(_hostId: string, _calendarId: string, eventId: string): Promise<void> {
    this.events.delete(eventId);
  }
}
