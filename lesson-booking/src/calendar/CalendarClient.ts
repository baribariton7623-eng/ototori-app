import type { BusyInterval } from '../shared/types.js';

export interface CalendarEventInput {
  calendarId: string;
  summary: string;
  description: string;
  startAt: string;
  endAt: string;
  timezone: string;
  attendeeEmail?: string;
}

/**
 * カレンダー連携の抽象。Google 実装とテスト用の Fake 実装がある。
 * hostId ごとに認可情報が異なるため、すべてのメソッドで hostId を受ける。
 */
export interface CalendarClient {
  /** 複数カレンダーの予定あり区間をまとめて返す */
  freeBusy(hostId: string, calendarIds: readonly string[], from: Date, to: Date): Promise<BusyInterval[]>;
  createEvent(hostId: string, input: CalendarEventInput): Promise<{ eventId: string }>;
  updateEvent(
    hostId: string,
    calendarId: string,
    eventId: string,
    patch: Pick<CalendarEventInput, 'startAt' | 'endAt' | 'timezone'>,
  ): Promise<void>;
  deleteEvent(hostId: string, calendarId: string, eventId: string): Promise<void>;
}
