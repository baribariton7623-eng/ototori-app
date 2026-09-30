import type { Server } from 'node:http';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createApp } from '../src/http/app.js';
import { jst, setupWorld, type TestWorld } from './helpers.js';

let w: TestWorld;
let server: Server;
let base = '';

const TEACHER = { 'x-dev-user-email': 'teacher@example.com', 'x-dev-user-name': encodeURIComponent('講師A') };
const STUDENT = { 'x-dev-user-email': 'student@example.com', 'x-dev-user-name': encodeURIComponent('生徒B') };

async function call(method: string, path: string, headers: Record<string, string>, body?: unknown) {
  const res = await fetch(base + path, {
    method,
    headers: { 'content-type': 'application/json', ...headers },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const text = await res.text();
  return { status: res.status, json: text ? JSON.parse(text) : null };
}

beforeAll(async () => {
  w = await setupWorld();
  const app = createApp({
    repos: w.repos,
    calendar: w.calendar,
    availability: w.availability,
    bookings: w.bookings,
    clock: w.clock,
    auth: { mode: 'dev' },
    defaultTimezone: 'Asia/Tokyo',
  });
  await new Promise<void>((resolve) => {
    server = app.listen(0, '127.0.0.1', () => resolve());
  });
  const addr = server.address();
  if (!addr || typeof addr === 'string') throw new Error('no port');
  base = `http://127.0.0.1:${addr.port}`;
});

afterAll(async () => {
  await new Promise<void>((resolve) => server.close(() => resolve()));
});

describe('API 一連の流れ', () => {
  it('未ログインでは予約できない', async () => {
    const r = await call('POST', '/bookings', {}, { hostId: w.host.id, startAt: jst('2026-10-20T10:00:00').toISOString() });
    expect(r.status).toBe(403);
  });

  it('/rules で業務ルール定数と3択のラベルが取れる', async () => {
    const r = await call('GET', '/rules', {});
    expect(r.status).toBe(200);
    expect(r.json.bookingHorizonDays).toBe(40);
    expect(r.json.lateChangeThresholdDays).toBe(14);
    expect(r.json.lateChangeOptions.map((o: { value: string }) => o.value)).toEqual([
      'request_approval',
      'reschedule_within_two_weeks',
      'pay_cancellation_fee',
    ]);
  });

  it('生徒: 空き枠を見て予約 → 直前キャンセル要求 → 主催者が承認', async () => {
    // 空き枠取得(公開)
    const slots = await call('GET', `/hosts/${w.host.id}/slots`, {});
    expect(slots.status).toBe(200);
    expect(slots.json.slots.length).toBeGreaterThan(0);
    const near = jst('2026-10-06T10:00:00').toISOString();
    expect(slots.json.slots.some((s: { startAt: string }) => s.startAt === near)).toBe(true);

    // 予約
    const created = await call('POST', '/bookings', STUDENT, { hostId: w.host.id, startAt: near, note: '初回です' });
    expect(created.status).toBe(201);
    expect(created.json.status).toBe('confirmed');
    expect(created.json.requiresApprovalToChange).toBe(true);
    const bookingId = created.json.id as string;

    // 直前キャンセル: メッセージなし → 400
    const bad = await call('POST', `/bookings/${bookingId}/change`, STUDENT, { kind: 'cancel' });
    expect(bad.status).toBe(400);
    expect(bad.json.error.code).toBe('late_change_requires_request');

    // 直前キャンセル: メッセージ+対応方法 → 202 承認待ち
    const req = await call('POST', `/bookings/${bookingId}/change`, STUDENT, {
      kind: 'cancel',
      message: '体調不良のためお休みします',
      option: 'pay_cancellation_fee',
    });
    expect(req.status).toBe(202);
    expect(req.json.type).toBe('pending_approval');
    const requestId = req.json.request.id as string;

    // 生徒側から見ると予約は確定のまま、変更要求が付いている
    const detail = await call('GET', `/bookings/${bookingId}`, STUDENT);
    expect(detail.json.status).toBe('confirmed');
    expect(detail.json.changeRequests).toHaveLength(1);

    // 主催者: 承認待ち一覧
    const pending = await call('GET', `/hosts/${w.host.id}/change-requests`, TEACHER);
    expect(pending.status).toBe(200);
    expect(pending.json).toHaveLength(1);
    expect(pending.json[0].optionLabel).toBe('キャンセルフィーを支払う');
    expect(pending.json[0].student.email).toBe('student@example.com');

    // 生徒は主催者のエンドポイントを叩けない
    const forbidden = await call('POST', `/hosts/${w.host.id}/change-requests/${requestId}/decision`, STUDENT, { decision: 'approve' });
    expect(forbidden.status).toBe(403);

    // 主催者: 承認
    const decided = await call('POST', `/hosts/${w.host.id}/change-requests/${requestId}/decision`, TEACHER, {
      decision: 'approve',
      note: '承知しました。フィーは次回レッスン時にお願いします',
    });
    expect(decided.status).toBe(200);
    expect(decided.json.request.status).toBe('approved');
    expect(decided.json.booking.status).toBe('cancelled');
    expect(decided.json.booking.cancellationFeeStatus).toBe('pending');

    // 入金確認
    const paid = await call('POST', `/hosts/${w.host.id}/bookings/${bookingId}/fee-paid`, TEACHER);
    expect(paid.status).toBe(200);
    expect(paid.json.cancellationFeeStatus).toBe('paid');

    // 枠は空きに戻っている
    const after = await call('GET', `/hosts/${w.host.id}/slots`, {});
    expect(after.json.slots.some((s: { startAt: string }) => s.startAt === near)).toBe(true);
  });

  it('猶予のある予約は即時キャンセルできる(200 applied)', async () => {
    const far = jst('2026-10-22T10:00:00').toISOString();
    const created = await call('POST', '/bookings', STUDENT, { hostId: w.host.id, startAt: far });
    expect(created.status).toBe(201);
    expect(created.json.requiresApprovalToChange).toBe(false);
    const r = await call('POST', `/bookings/${created.json.id}/change`, STUDENT, { kind: 'cancel' });
    expect(r.status).toBe(200);
    expect(r.json.type).toBe('applied');
    expect(r.json.booking.status).toBe('cancelled');
  });

  it('主催者設定: 営業時間枠とカレンダーの追加・検証', async () => {
    const badWindow = await call('POST', `/hosts/${w.host.id}/availability-windows`, TEACHER, { weekday: 6, startTime: '12:00', endTime: '10:00' });
    expect(badWindow.status).toBe(400);
    const okWindow = await call('POST', `/hosts/${w.host.id}/availability-windows`, TEACHER, { weekday: 6, startTime: '10:00', endTime: '12:00' });
    expect(okWindow.status).toBe(201);

    const dupTarget = await call('POST', `/hosts/${w.host.id}/calendars`, TEACHER, { calendarId: 'another', role: 'write_target' });
    expect(dupTarget.status).toBe(400);
    const okSource = await call('POST', `/hosts/${w.host.id}/calendars`, TEACHER, { calendarId: 'another', label: '教室', role: 'busy_source' });
    expect(okSource.status).toBe(201);

    const list = await call('GET', `/hosts/${w.host.id}/calendars`, TEACHER);
    expect(list.json).toHaveLength(3);
  });

  it('不正な JSON は 400', async () => {
    const res = await fetch(base + '/bookings', { method: 'POST', headers: { 'content-type': 'application/json', ...STUDENT }, body: '{bad' });
    expect(res.status).toBe(400);
  });
});
