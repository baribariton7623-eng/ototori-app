import type { Server } from 'node:http';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { FakeBillingProvider } from '../src/billing/FakeBillingProvider.js';
import { createApp } from '../src/http/app.js';
import { BillingService } from '../src/services/BillingService.js';
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
    billing: new BillingService(w.repos, new FakeBillingProvider('http://localhost')),
    accounts: w.accounts,
    reminders: w.reminders,
    fees: w.fees,
    organizations: w.organizations,
    cronSecret: 'cron-test-secret',
    fakeBilling: true,
    clock: w.clock,
    auth: { mode: 'dev' },
    defaultTimezone: 'Asia/Tokyo',
    appBaseUrl: 'http://localhost',
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
      feeMethod: 'in_person',
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

describe('複数主催者・課金 API', () => {
  const TEACHER2 = { 'x-dev-user-email': 'teacher2@example.com' };

  it('主催者登録で slug が付与され、公開ページ情報を slug で取得できる', async () => {
    const created = await call('POST', '/hosts', TEACHER2, { displayName: '講師C', slug: 'Piano-Lab', bio: 'ピアノ教室です' });
    expect(created.status).toBe(201);
    expect(created.json.slug).toBe('piano-lab');
    expect(created.json.plan).toBe('free');

    const pub = await call('GET', '/hosts/by-slug/piano-lab', {});
    expect(pub.status).toBe(200);
    expect(pub.json).toMatchObject({ slug: 'piano-lab', displayName: '講師C', bio: 'ピアノ教室です' });
    expect(pub.json.email).toBeUndefined();
    expect(pub.json.plan).toBeUndefined();

    // slug の重複は不可
    const dup = await call('PATCH', `/hosts/${w.host.id}`, TEACHER, { slug: 'piano-lab' });
    expect(dup.status).toBe(400);
    // 主催者一覧は公開しない
    expect((await call('GET', '/hosts', {})).status).toBe(404);
  });

  it('フリープランはカレンダー1件まで。課金を有効化すると制限が外れる', async () => {
    const me = await call('GET', '/me', TEACHER2);
    const hostId = me.json.host.id as string;

    const first = await call('POST', `/hosts/${hostId}/calendars`, TEACHER2, { calendarId: 'primary', role: 'write_target' });
    expect(first.status).toBe(201);
    const second = await call('POST', `/hosts/${hostId}/calendars`, TEACHER2, { calendarId: 'second', role: 'busy_source' });
    expect(second.status).toBe(402);
    expect(second.json.error.code).toBe('plan_limit');

    const billing = await call('GET', `/hosts/${hostId}/billing`, TEACHER2);
    expect(billing.json.effectivePlan).toBe('free');
    expect(billing.json.usage.calendars).toBe(1);
    expect(billing.json.publicUrl).toBe('http://localhost/#/h/piano-lab');

    const checkout = await call('POST', `/hosts/${hostId}/billing/checkout`, TEACHER2, {
      successUrl: 'http://localhost/#/host',
      cancelUrl: 'http://localhost/#/host',
    });
    expect(checkout.status).toBe(200);
    expect(checkout.json.url).toContain('/billing/fake/activate?');

    // fake の checkout URL を踏む(リダイレクトは追わない)
    const activate = await fetch(base + new URL(checkout.json.url).pathname + new URL(checkout.json.url).search, { redirect: 'manual' });
    expect(activate.status).toBe(302);

    const after = await call('GET', `/hosts/${hostId}/billing`, TEACHER2);
    expect(after.json.effectivePlan).toBe('pro');
    const third = await call('POST', `/hosts/${hostId}/calendars`, TEACHER2, { calendarId: 'second', role: 'busy_source' });
    expect(third.status).toBe(201);

    // Webhook(fake は JSON をそのまま受ける)で解約
    const cus = after.json.subscriptionStatus === 'active' ? 'fake_cus_' + hostId.slice(0, 8) : '';
    const hook = await fetch(base + '/billing/webhook', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ type: 'subscription_canceled', customerId: cus, subscriptionId: 'x' }),
    });
    expect(hook.status).toBe(200);
    const final = await call('GET', `/hosts/${hostId}/billing`, TEACHER2);
    expect(final.json.effectivePlan).toBe('free');
    expect(final.json.subscriptionStatus).toBe('canceled');
  });

  it('他の主催者の課金情報や設定にはアクセスできない', async () => {
    const r = await call('GET', `/hosts/${w.host.id}/billing`, TEACHER2);
    expect(r.status).toBe(403);
    const r2 = await call('POST', `/hosts/${w.host.id}/availability-windows`, TEACHER2, { weekday: 0, startTime: '09:00', endTime: '10:00' });
    expect(r2.status).toBe(403);
  });
});

describe('休講・退会 API', () => {
  const S2 = { 'x-dev-user-email': 'student2@example.com' };
  const T3 = { 'x-dev-user-email': 'teacher3@example.com' };

  it('講師は予約を休講にできる(メッセージ必須)', async () => {
    const created = await call('POST', '/bookings', S2, { hostId: w.host.id, startAt: jst('2026-10-27T10:00:00').toISOString() });
    expect(created.status).toBe(201);
    const noReason = await call('POST', `/hosts/${w.host.id}/bookings/${created.json.id}/cancel`, TEACHER, { reason: '' });
    expect(noReason.status).toBe(400);
    const byStudent = await call('POST', `/hosts/${w.host.id}/bookings/${created.json.id}/cancel`, S2, { reason: 'x' });
    expect(byStudent.status).toBe(403);
    const ok = await call('POST', `/hosts/${w.host.id}/bookings/${created.json.id}/cancel`, TEACHER, { reason: '学会出張のため' });
    expect(ok.status).toBe(200);
    expect(ok.json.status).toBe('cancelled');
  });

  it('退会は確認文字列が一致しないと拒否。生徒はメール、講師は URL 名', async () => {
    const bad = await call('DELETE', '/me', S2, { confirm: 'wrong@example.com' });
    expect(bad.status).toBe(400);
    const ok = await call('DELETE', '/me', S2, { confirm: 'student2@example.com' });
    expect(ok.status).toBe(200);
    expect(ok.json.deletedStudent).toBe(true);

    const reg = await call('POST', '/hosts', T3, { displayName: '講師D', slug: 'teacher-d' });
    expect(reg.status).toBe(201);
    const badHost = await call('DELETE', '/me', T3, { confirm: 'teacher3@example.com' });
    expect(badHost.status).toBe(400);
    const okHost = await call('DELETE', '/me', T3, { confirm: 'teacher-d' });
    expect(okHost.status).toBe(200);
    expect(okHost.json.deletedHost).toBe(true);
    expect((await call('GET', '/hosts/by-slug/teacher-d', {})).status).toBe(404);
    expect((await call('GET', '/me', T3)).json.role).toBe('student');
  });
});

describe('定期実行エンドポイント', () => {
  it('シークレットが一致しないと 403、一致すれば実行結果を返す', async () => {
    const res1 = await fetch(base + '/internal/cron/reminders', { method: 'POST' });
    expect(res1.status).toBe(403);
    const res2 = await fetch(base + '/internal/cron/reminders', { method: 'POST', headers: { 'x-cron-secret': 'wrong' } });
    expect(res2.status).toBe(403);
    const res3 = await fetch(base + '/internal/cron/reminders', { method: 'POST', headers: { 'x-cron-secret': 'cron-test-secret' } });
    expect(res3.status).toBe(200);
    expect(await res3.json()).toMatchObject({ checked: expect.any(Number), sent: expect.any(Number), failed: 0 });
  });
});

describe('キャンセルフィー決済 API', () => {
  const S3 = { 'x-dev-user-email': 'student3@example.com' };

  it('講師が連携 → 生徒が決済 URL 取得 → fake 決済で支払済みになる', async () => {
    // 講師A はプロ(テスト初期値)。金額設定と Stripe 連携
    const patched = await call('PATCH', `/hosts/${w.host.id}`, TEACHER, { cancellationFeeAmount: 2500 });
    expect(patched.status).toBe(200);
    const tooSmall = await call('PATCH', `/hosts/${w.host.id}`, TEACHER, { cancellationFeeAmount: 10 });
    expect(tooSmall.status).toBe(400);

    const onboarding = await call('POST', `/hosts/${w.host.id}/connect/onboarding`, TEACHER, {
      refreshUrl: 'http://localhost/#/host',
      returnUrl: 'http://localhost/#/host',
    });
    expect(onboarding.status).toBe(200);
    const ob = new URL(onboarding.json.url);
    expect((await fetch(base + ob.pathname + ob.search, { redirect: 'manual' })).status).toBe(302);
    const status = await call('GET', `/hosts/${w.host.id}/connect`, TEACHER);
    expect(status.json).toMatchObject({ available: true, chargesEnabled: true, active: true, cancellationFeeAmount: 2500 });

    const pub = await call('GET', `/hosts/by-slug/teacher-a`, {});
    expect(pub.json).toMatchObject({ cancellationFeeAmount: 2500, onlineFeePayment: true });
    expect(pub.json.stripeConnectAccountId).toBeUndefined();

    // 直前予約 → フィー支払いで申請 → 承認
    const b = await call('POST', '/bookings', S3, { hostId: w.host.id, startAt: jst('2026-10-08T15:00:00').toISOString() });
    expect(b.status).toBe(201);
    const req = await call('POST', `/bookings/${b.json.id}/change`, S3, { kind: 'cancel', message: 'すみません', option: 'pay_cancellation_fee', feeMethod: 'card' });
    expect(req.status).toBe(202);
    await call('POST', `/hosts/${w.host.id}/change-requests/${req.json.request.id}/decision`, TEACHER, { decision: 'approve' });

    const mine = await call('GET', '/bookings', S3);
    const target = mine.json.find((x: { id: string }) => x.id === b.json.id);
    expect(target).toMatchObject({ cancellationFeeStatus: 'pending', cancellationFeeAmount: 2500, feePayableOnline: true });

    const checkout = await call('POST', `/bookings/${b.json.id}/fee-checkout`, S3, {
      successUrl: 'http://localhost/#/mine',
      cancelUrl: 'http://localhost/#/mine',
    });
    expect(checkout.status).toBe(200);
    const co = new URL(checkout.json.url);
    expect((await fetch(base + co.pathname + co.search, { redirect: 'manual' })).status).toBe(302);
    const after = await call('GET', `/bookings/${b.json.id}`, S3);
    expect(after.json).toMatchObject({ cancellationFeeStatus: 'paid', feePayableOnline: false });
  });

  it('Connect Webhook(fake は JSON をそのまま受ける)', async () => {
    const res = await fetch(base + '/billing/connect-webhook', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ type: 'ignored', raw: 'x' }),
    });
    expect(res.status).toBe(200);
  });
});

describe('教室プラン API', () => {
  const OWNER = { 'x-dev-user-email': 'school-owner@example.com' };
  const MEMBER = { 'x-dev-user-email': 'school-member@example.com' };

  it('作成 → 招待 → 承諾 → 契約 → 公開ページ', async () => {
    expect((await call('POST', '/hosts', OWNER, { displayName: '管理講師', slug: 'school-owner' })).status).toBe(201);
    const created = await call('POST', '/orgs', OWNER, { name: 'さくら音楽教室', slug: 'sakura', bio: '駅前の音楽教室です' });
    expect(created.status).toBe(201);
    const orgId = created.json.id as string;

    const inv = await call('POST', `/orgs/${orgId}/invitations`, OWNER, { email: 'school-member@example.com' });
    expect(inv.status).toBe(201);
    // 招待先は講師登録前でも招待を見られるが、承諾には講師登録が必要
    expect((await call('GET', '/me/invitations', MEMBER)).json).toHaveLength(1);
    expect((await call('POST', `/invitations/${inv.json.id}/accept`, MEMBER)).status).toBe(403);
    expect((await call('POST', '/hosts', MEMBER, { displayName: '所属講師', slug: 'school-member' })).status).toBe(201);
    expect((await call('POST', `/invitations/${inv.json.id}/accept`, MEMBER)).status).toBe(200);

    const ownerView = await call('GET', '/me/organization', OWNER);
    expect(ownerView.json.isOwner).toBe(true);
    expect(ownerView.json.members.map((m: { email?: string }) => m.email).sort()).toEqual(['school-member@example.com', 'school-owner@example.com']);
    const memberView = await call('GET', '/me/organization', MEMBER);
    expect(memberView.json.isOwner).toBe(false);
    expect(memberView.json.members.every((m: { email?: string }) => m.email === undefined)).toBe(true);

    // 所属講師は契約できない
    expect((await call('POST', `/orgs/${orgId}/billing/checkout`, MEMBER, { successUrl: 'http://localhost/', cancelUrl: 'http://localhost/' })).status).toBe(403);
    const co = await call('POST', `/orgs/${orgId}/billing/checkout`, OWNER, { successUrl: 'http://localhost/#/host', cancelUrl: 'http://localhost/#/host' });
    const u = new URL(co.json.url);
    expect((await fetch(base + u.pathname + u.search, { redirect: 'manual' })).status).toBe(302);
    const billing = await call('GET', `/hosts/${memberView.json.members.find((m: { slug: string }) => m.slug === 'school-member').id}/billing`, MEMBER);
    expect(billing.json).toMatchObject({ effectivePlan: 'pro', viaOrganization: true });

    const pub = await call('GET', '/orgs/by-slug/sakura', {});
    expect(pub.status).toBe(200);
    expect(pub.json.name).toBe('さくら音楽教室');
    expect(pub.json.teachers.map((t: { slug: string }) => t.slug)).toEqual(['school-owner', 'school-member']);
    expect(pub.json.teachers[0].email).toBeUndefined();
    expect((await call('GET', '/orgs/by-slug/nothing', {})).status).toBe(404);
  });
});

describe('支払い方法 API', () => {
  const S4 = { 'x-dev-user-email': 'student4@example.com' };

  it('公開情報に選べる方法、承認後の生徒には振込先、講師は方法を変更できる', async () => {
    const bank = 'ゆうちょ銀行 〇一八支店 普通 7654321 コウシエー';
    const p = await call('PATCH', `/hosts/${w.host.id}`, TEACHER, { feeMethods: ['bank_transfer', 'in_person'], bankTransferInfo: bank });
    expect(p.status).toBe(200);
    expect((await call('PATCH', `/hosts/${w.host.id}`, TEACHER, { feeMethods: ['cash'] })).status).toBe(400);

    const pub = await call('GET', '/hosts/by-slug/teacher-a', {});
    expect(pub.json.feeMethods).toEqual(['bank_transfer', 'in_person']);
    expect(JSON.stringify(pub.json)).not.toContain('7654321');

    const rules = await call('GET', '/rules', {});
    expect(rules.json.rescheduleRangeDays).toBe(7);
    expect(rules.json.feeMethods.map((m: { label: string }) => m.label)).toEqual(['クレジットカード', '銀行振込', '次回レッスン時に手渡し']);

    const b = await call('POST', '/bookings', S4, { hostId: w.host.id, startAt: jst('2026-10-09T16:00:00').toISOString() });
    const noMethod = await call('POST', `/bookings/${b.json.id}/change`, S4, { kind: 'cancel', message: 'x', option: 'pay_cancellation_fee' });
    expect(noMethod.status).toBe(400);
    const req = await call('POST', `/bookings/${b.json.id}/change`, S4, { kind: 'cancel', message: 'x', option: 'pay_cancellation_fee', feeMethod: 'bank_transfer' });
    expect(req.status).toBe(202);

    const list = await call('GET', `/hosts/${w.host.id}/change-requests`, TEACHER);
    expect(list.json.find((c: { id: string }) => c.id === req.json.request.id)?.feeMethodLabel).toBe('銀行振込');
    // 承認前の生徒には振込先を出さない
    expect((await call('GET', `/bookings/${b.json.id}`, S4)).json.bankTransferInfo).toBeUndefined();

    await call('POST', `/hosts/${w.host.id}/change-requests/${req.json.request.id}/decision`, TEACHER, { decision: 'approve' });
    const detail = await call('GET', `/bookings/${b.json.id}`, S4);
    expect(detail.json).toMatchObject({ cancellationFeeMethod: 'bank_transfer', bankTransferInfo: bank, feePayableOnline: false });

    const byStudent = await call('POST', `/hosts/${w.host.id}/bookings/${b.json.id}/fee-method`, S4, { method: 'in_person' });
    expect(byStudent.status).toBe(403);
    const changed = await call('POST', `/hosts/${w.host.id}/bookings/${b.json.id}/fee-method`, TEACHER, { method: 'in_person' });
    expect(changed.status).toBe(200);
    expect(changed.json.cancellationFeeMethod).toBe('in_person');
    expect((await call('GET', `/bookings/${b.json.id}`, S4)).json.bankTransferInfo).toBeUndefined();
  });
});

describe('振替の希望日時 API', () => {
  const S5 = { 'x-dev-user-email': 'student5@example.com' };

  it('第1〜第2希望で申請 → 講師に候補と空き状況 → 第2希望で承認', async () => {
    const b = await call('POST', '/bookings', S5, { hostId: w.host.id, startAt: jst('2026-10-02T11:00:00').toISOString() });
    expect(b.status).toBe(201);
    const c1 = jst('2026-10-07T15:00:00').toISOString();
    const c2 = jst('2026-10-08T15:00:00').toISOString();
    const tooMany = await call('POST', `/bookings/${b.json.id}/change`, S5, {
      kind: 'reschedule',
      option: 'reschedule_within_two_weeks',
      message: 'x',
      proposedStartAts: [c1, c2, jst('2026-10-05T15:00:00').toISOString(), jst('2026-10-06T15:00:00').toISOString()],
    });
    expect(tooMany.status).toBe(400);
    const req = await call('POST', `/bookings/${b.json.id}/change`, S5, {
      kind: 'reschedule',
      option: 'reschedule_within_two_weeks',
      message: '振替希望です',
      proposedStartAts: [c1, c2],
    });
    expect(req.status).toBe(202);
    expect(req.json.request.proposedStartAts).toEqual([c1, c2]);

    const list = await call('GET', `/hosts/${w.host.id}/change-requests`, TEACHER);
    const mine = list.json.find((x: { id: string }) => x.id === req.json.request.id);
    expect(mine.candidates).toEqual([
      { startAt: c1, available: true },
      { startAt: c2, available: true },
    ]);

    const noChoice = await call('POST', `/hosts/${w.host.id}/change-requests/${req.json.request.id}/decision`, TEACHER, { decision: 'approve' });
    expect(noChoice.status).toBe(400);
    const ok = await call('POST', `/hosts/${w.host.id}/change-requests/${req.json.request.id}/decision`, TEACHER, { decision: 'approve', startAt: c2 });
    expect(ok.status).toBe(200);
    expect(ok.json.booking.startAt).toBe(c2);
    expect(ok.json.request.approvedStartAt).toBe(c2);
  });

  it('旧形式(proposedStartAt 1 件)も受け付ける', async () => {
    const b = await call('POST', '/bookings', S5, { hostId: w.host.id, startAt: jst('2026-10-02T14:00:00').toISOString() });
    const req = await call('POST', `/bookings/${b.json.id}/change`, S5, {
      kind: 'reschedule',
      option: 'reschedule_within_two_weeks',
      message: 'x',
      proposedStartAt: jst('2026-10-07T16:00:00').toISOString(),
    });
    expect(req.status).toBe(202);
    expect(req.json.request.proposedStartAts).toEqual([jst('2026-10-07T16:00:00').toISOString()]);
  });
});

describe('振替期間の設定 API', () => {
  it('講師が 1〜30 日で設定でき、公開情報と生徒の予約一覧・講師の申請一覧に反映される', async () => {
    expect((await call('PATCH', `/hosts/${w.host.id}`, TEACHER, { rescheduleRangeDays: 0 })).status).toBe(400);
    expect((await call('PATCH', `/hosts/${w.host.id}`, TEACHER, { rescheduleRangeDays: 31 })).status).toBe(400);
    const ok = await call('PATCH', `/hosts/${w.host.id}`, TEACHER, { rescheduleRangeDays: 10 });
    expect(ok.status).toBe(200);
    expect(ok.json.rescheduleRangeDays).toBe(10);

    expect((await call('GET', '/hosts/by-slug/teacher-a', {})).json.rescheduleRangeDays).toBe(10);
    const rules = await call('GET', '/rules', {});
    expect(rules.json.rescheduleRangeLimits).toEqual({ min: 1, max: 30 });

    const S6 = { 'x-dev-user-email': 'student6@example.com' };
    const b = await call('POST', '/bookings', S6, { hostId: w.host.id, startAt: jst('2026-10-05T17:00:00').toISOString() });
    expect((await call('GET', '/bookings', S6)).json[0].rescheduleRangeDays).toBe(10);
    // 9 日後の候補は 10 日設定なら申請できる
    const req = await call('POST', `/bookings/${b.json.id}/change`, S6, {
      kind: 'reschedule',
      option: 'reschedule_within_two_weeks',
      message: 'x',
      proposedStartAts: [jst('2026-10-14T17:00:00').toISOString()],
    });
    expect(req.status).toBe(202);
    const list = await call('GET', `/hosts/${w.host.id}/change-requests`, TEACHER);
    expect(list.json.find((c: { id: string }) => c.id === req.json.request.id).optionLabel).toBe('10日以内の別日に振替を希望する');

    // 後続のテストに影響しないよう戻す
    await call('PATCH', `/hosts/${w.host.id}`, TEACHER, { rescheduleRangeDays: 7 });
  });
});

describe('講師ごとのルール API', () => {
  it('承認制の日数と予約期間を設定でき、範囲外は 400。公開情報・予約一覧・空き枠に反映される', async () => {
    expect((await call('PATCH', `/hosts/${w.host.id}`, TEACHER, { lateChangeThresholdDays: -1 })).status).toBe(400);
    expect((await call('PATCH', `/hosts/${w.host.id}`, TEACHER, { lateChangeThresholdDays: 91 })).status).toBe(400);
    expect((await call('PATCH', `/hosts/${w.host.id}`, TEACHER, { bookingHorizonDays: 0 })).status).toBe(400);
    expect((await call('PATCH', `/hosts/${w.host.id}`, TEACHER, { bookingHorizonDays: 181 })).status).toBe(400);
    const ok = await call('PATCH', `/hosts/${w.host.id}`, TEACHER, { lateChangeThresholdDays: 3, bookingHorizonDays: 20 });
    expect(ok.json).toMatchObject({ lateChangeThresholdDays: 3, bookingHorizonDays: 20 });

    const pub = await call('GET', '/hosts/by-slug/teacher-a', {});
    expect(pub.json).toMatchObject({ lateChangeThresholdDays: 3, bookingHorizonDays: 20 });
    expect((await call('GET', `/hosts/${w.host.id}/slots`, {})).json.bookingHorizonDays).toBe(20);
    expect((await call('GET', '/rules', {})).json.policyLimits.lateChangeThresholdDays).toEqual({ min: 0, max: 90 });

    // 5 日後のレッスンは 3 日設定なら承認制ではない
    const S7 = { 'x-dev-user-email': 'student7@example.com' };
    const b = await call('POST', '/bookings', S7, { hostId: w.host.id, startAt: jst('2026-10-06T17:00:00').toISOString() });
    expect(b.json).toMatchObject({ requiresApprovalToChange: false, lateChangeThresholdDays: 3 });

    await call('PATCH', `/hosts/${w.host.id}`, TEACHER, { lateChangeThresholdDays: 14, bookingHorizonDays: 40 });
  });
});
