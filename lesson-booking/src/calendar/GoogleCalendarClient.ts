import { calendar, type calendar_v3 } from '@googleapis/calendar';
import { OAuth2Client } from 'google-auth-library';
import { DomainError } from '../domain/errors.js';
import type { BusyInterval } from '../shared/types.js';
import type { GoogleCredentialStore } from '../repo/Repository.js';
import { signState, verifyState } from '../security/signedState.js';
import type { CalendarClient, CalendarEventInput } from './CalendarClient.js';

export interface GoogleOAuthConfig {
  clientId: string;
  clientSecret: string;
  redirectUri: string;
  /** OAuth の state に署名する鍵 */
  stateSecret: string;
}

export const GOOGLE_SCOPES = [
  'https://www.googleapis.com/auth/calendar.events',
  'https://www.googleapis.com/auth/calendar.readonly',
];

/**
 * Google Calendar API 実装。
 * 主催者ごとに OAuth の refresh token を GoogleCredentialStore から読み出して使う。
 * freeBusy は複数カレンダーを1リクエストでまとめて問い合わせる。
 */
export class GoogleCalendarClient implements CalendarClient {
  constructor(
    private readonly oauth: GoogleOAuthConfig,
    private readonly credentials: GoogleCredentialStore,
  ) {}

  /**
   * 主催者に踏んでもらう認可URL。state には署名付きの講師 ID を載せる
   * (callback はログイン情報なしで呼ばれるため、署名がないと他人の講師 ID で連携を上書きできてしまう)
   */
  authUrl(hostId: string, now: Date = new Date()): string {
    const client = this.newOAuthClient();
    return client.generateAuthUrl({
      access_type: 'offline',
      prompt: 'consent',
      scope: GOOGLE_SCOPES,
      state: signState(this.oauth.stateSecret, hostId, now),
    });
  }

  /** state の署名を確かめて対象の講師 ID を返す。不正・期限切れなら例外 */
  hostIdFromState(state: string, now: Date = new Date()): string {
    const hostId = verifyState(this.oauth.stateSecret, state, now);
    if (!hostId) {
      throw new DomainError('forbidden', '連携の手続きが無効か期限切れです。設定画面の「Google と連携する」からやり直してください');
    }
    return hostId;
  }

  /** 認可コードを refresh token に交換して、state が示す講師に保存する */
  async handleCallback(state: string, code: string, now: Date = new Date()): Promise<string> {
    const hostId = this.hostIdFromState(state, now);
    const client = this.newOAuthClient();
    const { tokens } = await client.getToken(code);
    if (!tokens.refresh_token) {
      throw new DomainError('calendar_error', 'Google から refresh token が返されませんでした。再度「同意」からやり直してください');
    }
    await this.credentials.saveRefreshToken(hostId, tokens.refresh_token);
    return hostId;
  }

  /**
   * 連携解除・退会時: Google 側のトークンを失効させ、保存済みの refresh token を削除する。
   * 失効 API の失敗(既に失効済みなど)は無視し、ローカルの削除は必ず行う。
   */
  async revoke(hostId: string): Promise<void> {
    const token = await this.credentials.getRefreshToken(hostId);
    if (token) {
      try {
        await this.newOAuthClient().revokeToken(token);
      } catch (e) {
        console.warn('[google] トークンの失効に失敗しました(既に失効済みの可能性)', e instanceof Error ? e.message : e);
      }
    }
    await this.credentials.clear(hostId);
  }

  async freeBusy(hostId: string, calendarIds: readonly string[], from: Date, to: Date): Promise<BusyInterval[]> {
    if (calendarIds.length === 0) return [];
    const api = await this.api(hostId);
    try {
      const res = await api.freebusy.query({
        requestBody: {
          timeMin: from.toISOString(),
          timeMax: to.toISOString(),
          items: calendarIds.map((id) => ({ id })),
        },
      });
      const out: BusyInterval[] = [];
      const calendars = res.data.calendars ?? {};
      for (const id of calendarIds) {
        const entry = calendars[id];
        if (entry?.errors?.length) {
          throw new DomainError('calendar_error', `カレンダー ${id} の予定を取得できません`, entry.errors);
        }
        for (const b of entry?.busy ?? []) {
          if (b.start && b.end) out.push({ startAt: b.start, endAt: b.end, calendarId: id });
        }
      }
      return out;
    } catch (e) {
      throw wrap(e, 'Google カレンダーの空き状況取得に失敗しました');
    }
  }

  async createEvent(hostId: string, input: CalendarEventInput): Promise<{ eventId: string }> {
    const api = await this.api(hostId);
    try {
      const requestBody: calendar_v3.Schema$Event = {
        summary: input.summary,
        description: input.description,
        start: { dateTime: input.startAt, timeZone: input.timezone },
        end: { dateTime: input.endAt, timeZone: input.timezone },
      };
      if (input.attendeeEmail) requestBody.attendees = [{ email: input.attendeeEmail }];
      const res = await api.events.insert({ calendarId: input.calendarId, requestBody });
      const eventId = res.data.id;
      if (!eventId) throw new DomainError('calendar_error', 'イベントIDが返されませんでした');
      return { eventId };
    } catch (e) {
      throw wrap(e, 'Google カレンダーへのイベント作成に失敗しました');
    }
  }

  async updateEvent(
    hostId: string,
    calendarId: string,
    eventId: string,
    patch: Pick<CalendarEventInput, 'startAt' | 'endAt' | 'timezone'>,
  ): Promise<void> {
    const api = await this.api(hostId);
    try {
      await api.events.patch({
        calendarId,
        eventId,
        requestBody: {
          start: { dateTime: patch.startAt, timeZone: patch.timezone },
          end: { dateTime: patch.endAt, timeZone: patch.timezone },
        },
      });
    } catch (e) {
      throw wrap(e, 'Google カレンダーのイベント更新に失敗しました');
    }
  }

  async deleteEvent(hostId: string, calendarId: string, eventId: string): Promise<void> {
    const api = await this.api(hostId);
    try {
      await api.events.delete({ calendarId, eventId });
    } catch (e) {
      // 既に消えている場合(410/404)は成功扱い
      const status = (e as { code?: number; response?: { status?: number } }).code ??
        (e as { response?: { status?: number } }).response?.status;
      if (status === 404 || status === 410) return;
      throw wrap(e, 'Google カレンダーのイベント削除に失敗しました');
    }
  }

  private newOAuthClient() {
    return new OAuth2Client(this.oauth.clientId, this.oauth.clientSecret, this.oauth.redirectUri);
  }

  private async api(hostId: string): Promise<calendar_v3.Calendar> {
    const refreshToken = await this.credentials.getRefreshToken(hostId);
    if (!refreshToken) {
      throw new DomainError('calendar_error', 'Google カレンダーが未連携です。主催者が連携設定を行ってください', {
        hostId,
      });
    }
    const client = this.newOAuthClient();
    client.setCredentials({ refresh_token: refreshToken });
    return calendar({ version: 'v3', auth: client });
  }
}

function wrap(e: unknown, message: string): DomainError {
  if (e instanceof DomainError) return e;
  const detail = e instanceof Error ? e.message : String(e);
  return new DomainError('calendar_error', message, { cause: detail });
}
