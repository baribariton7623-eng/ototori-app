import express, { type NextFunction, type Request, type Response, type Router } from 'express';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { z } from 'zod';
import type { CalendarClient } from '../calendar/CalendarClient.js';
import type { GoogleCalendarClient } from '../calendar/GoogleCalendarClient.js';
import { DomainError } from '../domain/errors.js';
import {
  MIN_FEE_JPY,
  PLAN_LABELS,
  PLAN_LIMITS,
  SLUG_PATTERN,
  availableFeeMethods,
  canCollectFeeOnline,
  effectivePlan,
  isProViaOrganization,
  limitsFor,
  randomSlug,
} from '../domain/plans.js';
import { monthRange } from '../domain/time.js';
import type { Host } from '../domain/types.js';
import {
  BOOKING_HORIZON_DAYS,
  FEE_METHODS,
  FEE_METHOD_LABELS,
  LATE_CHANGE_OPTION_LABELS,
  MAX_RESCHEDULE_RANGE_DAYS,
  MIN_RESCHEDULE_RANGE_DAYS,
  lateChangeOptionLabel,
  LATE_CHANGE_OPTIONS,
  LATE_CHANGE_THRESHOLD_DAYS,
  MAX_BOOKING_HORIZON_DAYS,
  MAX_LATE_CHANGE_THRESHOLD_DAYS,
  MIN_BOOKING_HORIZON_DAYS,
  MIN_LATE_CHANGE_THRESHOLD_DAYS,
  RESCHEDULE_RANGE_DAYS,
  isLateChange,
} from '../domain/rules.js';
import { isValidTimeString, isValidTimeZone, timeStringToMinutes } from '../domain/time.js';
import type { Clock } from '../repo/InMemoryRepositories.js';
import type { Repositories } from '../repo/Repository.js';
import type { AccountService } from '../services/AccountService.js';
import type { AvailabilityService } from '../services/AvailabilityService.js';
import type { BillingService } from '../services/BillingService.js';
import type { BookingService } from '../services/BookingService.js';
import type { FeeService } from '../services/FeeService.js';
import type { OrganizationService } from '../services/OrganizationService.js';
import type { ReminderService } from '../services/ReminderService.js';
import { timingSafeEqual } from 'node:crypto';
import { authMiddleware, requireHost, requirePrincipal, requireStudent, type AuthMode } from './auth.js';

export interface AppDeps {
  repos: Repositories;
  calendar: CalendarClient;
  availability: AvailabilityService;
  bookings: BookingService;
  billing: BillingService;
  accounts: AccountService;
  reminders: ReminderService;
  fees: FeeService;
  organizations: OrganizationService;
  /** 定期実行エンドポイントの共有シークレット。空なら無効 */
  cronSecret: string;
  /** FakeBillingProvider のとき true(開発用の即時有効化エンドポイントを出す) */
  fakeBilling: boolean;
  clock: Clock;
  auth: AuthMode;
  /** CALENDAR=google のときだけ渡す(OAuth 連携エンドポイント用) */
  google?: GoogleCalendarClient | undefined;
  defaultTimezone: string;
  /** フロントエンドの公開 URL(公開予約ページ URL の生成に使う) */
  appBaseUrl: string;
  /** フロントエンド(web/dist)のパス。存在すれば静的配信する */
  staticDir?: string | undefined;
}

/** index.html を返す実パス(フロントの App が pathname で画面を出し分ける) */
export const SPA_PATHS = ['/terms', '/privacy', '/tokushoho'];

// ---------- 入力スキーマ ----------

const isoDate = z.iso.datetime({ offset: true }).transform((s) => new Date(s));
const timeString = z.string().refine(isValidTimeString, 'HH:MM 形式で指定してください');

const slugSchema = z.string().trim().toLowerCase().regex(SLUG_PATTERN, '英小文字・数字・ハイフンで3〜32文字');
const createHostSchema = z.object({
  displayName: z.string().trim().min(1).max(100),
  slug: slugSchema.optional(),
  bio: z.string().trim().max(2000).optional(),
  cancellationFeeAmount: z.number().int().min(MIN_FEE_JPY, `キャンセルフィーは${MIN_FEE_JPY}円以上にしてください`).max(1_000_000).nullable().optional(),
  feeMethods: z.array(z.enum(FEE_METHODS)).max(3).transform((a) => [...new Set(a)]).optional(),
  bankTransferInfo: z.string().trim().max(500).optional(),
  timezone: z.string().trim().refine(isValidTimeZone, 'タイムゾーンは Asia/Tokyo のような IANA 名で指定してください').optional(),
  lessonMinutes: z.number().int().min(5).max(24 * 60).optional(),
  rescheduleRangeDays: z
    .number()
    .int()
    .min(MIN_RESCHEDULE_RANGE_DAYS, `振替期間は${MIN_RESCHEDULE_RANGE_DAYS}〜${MAX_RESCHEDULE_RANGE_DAYS}日で指定してください`)
    .max(MAX_RESCHEDULE_RANGE_DAYS, `振替期間は${MIN_RESCHEDULE_RANGE_DAYS}〜${MAX_RESCHEDULE_RANGE_DAYS}日で指定してください`)
    .optional(),
  lateChangeThresholdDays: z
    .number()
    .int()
    .min(MIN_LATE_CHANGE_THRESHOLD_DAYS, `承認制にする日数は${MIN_LATE_CHANGE_THRESHOLD_DAYS}〜${MAX_LATE_CHANGE_THRESHOLD_DAYS}日で指定してください`)
    .max(MAX_LATE_CHANGE_THRESHOLD_DAYS, `承認制にする日数は${MIN_LATE_CHANGE_THRESHOLD_DAYS}〜${MAX_LATE_CHANGE_THRESHOLD_DAYS}日で指定してください`)
    .optional(),
  bookingHorizonDays: z
    .number()
    .int()
    .min(MIN_BOOKING_HORIZON_DAYS, `予約を受け付ける期間は${MIN_BOOKING_HORIZON_DAYS}〜${MAX_BOOKING_HORIZON_DAYS}日で指定してください`)
    .max(MAX_BOOKING_HORIZON_DAYS, `予約を受け付ける期間は${MIN_BOOKING_HORIZON_DAYS}〜${MAX_BOOKING_HORIZON_DAYS}日で指定してください`)
    .optional(),
  minLeadMinutes: z.number().int().min(0).max(30 * 24 * 60).optional(),
});
const patchHostSchema = createHostSchema.partial();
const billingUrlsSchema = z.object({
  successUrl: z.url(),
  cancelUrl: z.url(),
});
const returnUrlSchema = z.object({ returnUrl: z.url() });
const successCancelSchema = z.object({ successUrl: z.url(), cancelUrl: z.url() });
const hostCancelSchema = z.object({ reason: z.string().trim().min(1, '生徒へのメッセージを入力してください').max(2000) });
const deleteAccountSchema = z.object({ confirm: z.string().trim().min(1) });

const addCalendarSchema = z.object({
  calendarId: z.string().trim().min(1),
  label: z.string().trim().max(100).default(''),
  role: z.enum(['busy_source', 'write_target']),
});

const addWindowSchema = z
  .object({
    weekday: z.number().int().min(0).max(6),
    startTime: timeString,
    endTime: timeString,
  })
  .refine((w) => timeStringToMinutes(w.startTime) < timeStringToMinutes(w.endTime), {
    message: '終了時刻は開始時刻より後にしてください',
    path: ['endTime'],
  });

const slotsQuerySchema = z.object({
  from: isoDate.optional(),
  to: isoDate.optional(),
});

const createBookingSchema = z.object({
  hostId: z.string().min(1),
  startAt: isoDate,
  note: z.string().trim().max(1000).optional(),
});

const changeSchema = z.object({
  kind: z.enum(['cancel', 'reschedule']),
  message: z.string().trim().max(2000).optional(),
  option: z.enum(LATE_CHANGE_OPTIONS).optional(),
  /** 振替の希望日時(第1希望から順、最大 3 件) */
  proposedStartAts: z.array(isoDate).max(3).optional(),
  /** 旧形式(希望日時 1 件)。proposedStartAts と同時には使わない */
  proposedStartAt: isoDate.optional(),
  feeMethod: z.enum(FEE_METHODS).optional(),
});

const decisionSchema = z.object({
  decision: z.enum(['approve', 'reject']),
  note: z.string().trim().max(2000).optional(),
  /** 振替の承認時、希望日時の中から選んだ振替先(候補が 1 つなら省略可) */
  startAt: isoDate.optional(),
});

// ---------- アプリ ----------

export function createApp(deps: AppDeps): express.Express {
  const app = express();
  app.disable('x-powered-by');

  // 課金 Webhook は署名検証のため生ボディが必要。JSON パーサより前に登録する
  app.post('/billing/webhook', express.raw({ type: '*/*', limit: '1mb' }), wrap(async (req, res) => {
    const sig = header(req, 'stripe-signature');
    const event = await deps.billing.handleWebhook(req.body as Buffer, sig);
    res.json({ received: true, type: event.type });
  }));

  // 講師の Stripe アカウント(Connect)のイベント。キャンセルフィーの決済完了など
  app.post('/billing/connect-webhook', express.raw({ type: '*/*', limit: '1mb' }), wrap(async (req, res) => {
    const event = await deps.fees.handleWebhook(req.body as Buffer, header(req, 'stripe-signature'));
    res.json({ received: true, type: event.type });
  }));

  app.use(express.json({ limit: '100kb' }));

  // 定期実行(外部 cron から叩く)。ユーザー認証ではなく共有シークレットで保護する
  app.post('/internal/cron/reminders', wrap(async (req, res) => {
    if (!deps.cronSecret || !safeEqual(header(req, 'x-cron-secret') ?? '', deps.cronSecret)) {
      throw new DomainError('forbidden', 'cron シークレットが一致しません');
    }
    res.json(await deps.reminders.runOnce());
  }));

  app.use(authMiddleware(deps.repos, deps.auth));

  app.get('/health', (_req, res) => {
    res.json({ ok: true, now: deps.clock.now().toISOString() });
  });

  /** クライアントが表示に使う業務ルール定数 */
  app.get('/rules', (_req, res) => {
    res.json({
      // 既定値。実際の値は講師ごと(公開情報の bookingHorizonDays / lateChangeThresholdDays)
      bookingHorizonDays: BOOKING_HORIZON_DAYS,
      lateChangeThresholdDays: LATE_CHANGE_THRESHOLD_DAYS,
      policyLimits: {
        bookingHorizonDays: { min: MIN_BOOKING_HORIZON_DAYS, max: MAX_BOOKING_HORIZON_DAYS },
        lateChangeThresholdDays: { min: MIN_LATE_CHANGE_THRESHOLD_DAYS, max: MAX_LATE_CHANGE_THRESHOLD_DAYS },
        rescheduleRangeDays: { min: MIN_RESCHEDULE_RANGE_DAYS, max: MAX_RESCHEDULE_RANGE_DAYS },
      },
      // 既定値。実際の範囲は講師ごと(公開情報の rescheduleRangeDays)
      rescheduleRangeDays: RESCHEDULE_RANGE_DAYS,
      rescheduleRangeLimits: { min: MIN_RESCHEDULE_RANGE_DAYS, max: MAX_RESCHEDULE_RANGE_DAYS },
      lateChangeOptions: LATE_CHANGE_OPTIONS.map((value) => ({ value, label: LATE_CHANGE_OPTION_LABELS[value] })),
      feeMethods: FEE_METHODS.map((value) => ({ value, label: FEE_METHOD_LABELS[value] })),
      plans: (Object.keys(PLAN_LIMITS) as (keyof typeof PLAN_LIMITS)[]).map((plan) => ({
        plan,
        label: PLAN_LABELS[plan],
        limits: PLAN_LIMITS[plan],
      })),
    });
  });

  app.get('/me', (req, res) => {
    const p = requirePrincipal(req);
    res.json({ email: p.email, name: p.name, role: p.host ? 'host' : 'student', host: p.host });
  });

  /**
   * 退会。誤操作防止のため確認文字列を要求する(主催者は URL 名、生徒はメールアドレス)。
   */
  app.delete('/me', wrap(async (req, res) => {
    const p = requirePrincipal(req);
    const body = deleteAccountSchema.parse(req.body ?? {});
    const expected = p.host ? p.host.slug : p.email;
    if (body.confirm.toLowerCase() !== expected.toLowerCase()) {
      throw new DomainError('validation', p.host ? '確認のため URL 名を正しく入力してください' : '確認のためメールアドレスを正しく入力してください', {
        field: 'confirm',
      });
    }
    const result = await deps.accounts.deleteAccount({ email: p.email, subject: p.subject, host: p.host });
    res.json(result);
  }));

  // 公開ルートを先に登録する。後にすると /hosts/by-slug/<slug> が講師用の /hosts/:hostId/<sub> に
  // 先に一致し、URL 名が billing などの講師の予約ページが開けなくなる
  app.use(publicRoutes(deps));
  app.use(hostRoutes(deps));
  app.use(organizationRoutes(deps));
  app.use(studentRoutes(deps));
  app.use(googleRoutes(deps));

  if (deps.staticDir && existsSync(path.join(deps.staticDir, 'index.html'))) {
    const indexHtml = path.join(deps.staticDir, 'index.html');
    app.use(express.static(deps.staticDir));
    // 法務ページは Google OAuth 審査・特商法表記のためハッシュではなく実パスで公開する
    app.get(SPA_PATHS, (_req, res) => res.sendFile(indexHtml));
  }

  app.use((_req, res) => {
    res.status(404).json({ error: { code: 'not_found', message: 'エンドポイントが見つかりません' } });
  });
  app.use(errorHandler);
  return app;
}

// ---------- 主催者用 ----------

function hostRoutes(deps: AppDeps): Router {
  const r = express.Router();
  const { repos } = deps;

  // 主催者として登録(ログイン中ユーザー自身を主催者にする)
  r.post('/hosts', wrap(async (req, res) => {
    const p = requirePrincipal(req);
    if (p.host) throw new DomainError('invalid_state', '既に主催者として登録されています', { hostId: p.host.id });
    const body = createHostSchema.parse(req.body);
    const slug = body.slug ?? (await uniqueRandomSlug(repos));
    if (await repos.hosts.findBySlug(slug)) throw new DomainError('validation', 'この URL 名は既に使われています', { field: 'slug' });
    const host = await repos.hosts.create({
      email: p.email,
      displayName: body.displayName,
      slug,
      bio: body.bio ?? '',
      plan: 'free',
      subscriptionStatus: 'none',
      stripeCustomerId: null,
      stripeSubscriptionId: null,
      cancellationFeeAmount: body.cancellationFeeAmount ?? null,
      feeMethods: body.feeMethods ?? ['bank_transfer', 'in_person', 'card'],
      bankTransferInfo: body.bankTransferInfo ?? '',
      stripeConnectAccountId: null,
      connectChargesEnabled: false,
      organizationId: null,
      orgPlanActive: false,
      timezone: body.timezone ?? deps.defaultTimezone,
      lessonMinutes: body.lessonMinutes ?? 60,
      rescheduleRangeDays: body.rescheduleRangeDays ?? RESCHEDULE_RANGE_DAYS,
      lateChangeThresholdDays: body.lateChangeThresholdDays ?? LATE_CHANGE_THRESHOLD_DAYS,
      bookingHorizonDays: body.bookingHorizonDays ?? BOOKING_HORIZON_DAYS,
      minLeadMinutes: body.minLeadMinutes ?? 60,
    });
    res.status(201).json(host);
  }));

  r.patch('/hosts/:hostId', wrap(async (req, res) => {
    const host = requireHost(req, param(req, 'hostId'));
    const body = patchHostSchema.parse(req.body);
    if (body.slug && body.slug !== host.slug && (await repos.hosts.findBySlug(body.slug))) {
      throw new DomainError('validation', 'この URL 名は既に使われています', { field: 'slug' });
    }
    const patch = Object.fromEntries(Object.entries(body).filter(([, v]) => v !== undefined));
    res.json(await repos.hosts.update(host.id, patch));
  }));

  r.get('/hosts/:hostId/calendars', wrap(async (req, res) => {
    const host = requireHost(req, param(req, 'hostId'));
    res.json(await repos.hostCalendars.listByHost(host.id));
  }));

  r.post('/hosts/:hostId/calendars', wrap(async (req, res) => {
    const host = requireHost(req, param(req, 'hostId'));
    const body = addCalendarSchema.parse(req.body);
    const existing = await repos.hostCalendars.listByHost(host.id);
    const maxCalendars = limitsFor(host).maxCalendars;
    if (maxCalendars !== null && existing.length >= maxCalendars) {
      throw new DomainError('plan_limit', `${PLAN_LABELS[effectivePlan(host)]}プランで連携できるカレンダーは${maxCalendars}件までです`, {
        limit: maxCalendars,
      });
    }
    if (existing.some((c) => c.calendarId === body.calendarId)) {
      throw new DomainError('validation', 'このカレンダーは既に連携済みです', { calendarId: body.calendarId });
    }
    if (body.role === 'write_target' && existing.some((c) => c.role === 'write_target')) {
      throw new DomainError('validation', '書き込み先カレンダーは1件だけ設定できます');
    }
    res.status(201).json(await repos.hostCalendars.add({ hostId: host.id, ...body }));
  }));

  r.delete('/hosts/:hostId/calendars/:id', wrap(async (req, res) => {
    const host = requireHost(req, param(req, 'hostId'));
    await repos.hostCalendars.remove(host.id, param(req, 'id'));
    res.status(204).end();
  }));

  r.get('/hosts/:hostId/availability-windows', wrap(async (req, res) => {
    const host = requireHost(req, param(req, 'hostId'));
    res.json(await repos.availabilityWindows.listByHost(host.id));
  }));

  r.post('/hosts/:hostId/availability-windows', wrap(async (req, res) => {
    const host = requireHost(req, param(req, 'hostId'));
    const body = addWindowSchema.parse(req.body);
    res.status(201).json(
      await repos.availabilityWindows.add({ hostId: host.id, weekday: body.weekday as 0 | 1 | 2 | 3 | 4 | 5 | 6, startTime: body.startTime, endTime: body.endTime }),
    );
  }));

  r.delete('/hosts/:hostId/availability-windows/:id', wrap(async (req, res) => {
    const host = requireHost(req, param(req, 'hostId'));
    await repos.availabilityWindows.remove(host.id, param(req, 'id'));
    res.status(204).end();
  }));

  r.get('/hosts/:hostId/bookings', wrap(async (req, res) => {
    const host = requireHost(req, param(req, 'hostId'));
    const list = await repos.bookings.listByHost(host.id);
    const students = new Map<string, Awaited<ReturnType<typeof repos.students.findById>>>();
    const out = [];
    for (const b of list) {
      if (!students.has(b.studentId)) students.set(b.studentId, await repos.students.findById(b.studentId));
      const s = students.get(b.studentId) ?? null;
      out.push({ ...b, student: s ? { id: s.id, email: s.email, name: s.name } : null });
    }
    res.json(out);
  }));

  r.get('/hosts/:hostId/change-requests', wrap(async (req, res) => {
    const host = requireHost(req, param(req, 'hostId'));
    const status = typeof req.query.status === 'string' ? req.query.status : 'pending';
    const parsed = z.enum(['pending', 'approved', 'rejected', 'all']).parse(status);
    const list = await repos.changeRequests.listByHost(host.id, parsed === 'all' ? undefined : parsed);
    const out = [];
    for (const c of list) {
      const [booking, student] = await Promise.all([repos.bookings.findById(c.bookingId), repos.students.findById(c.studentId)]);
      out.push({
        ...c,
        optionLabel: lateChangeOptionLabel(c.option, host.rescheduleRangeDays),
        feeMethodLabel: c.feeMethod ? FEE_METHOD_LABELS[c.feeMethod] : null,
        candidates: await deps.bookings.candidateAvailability(c),
        booking,
        student: student ? { id: student.id, email: student.email, name: student.name } : null,
      });
    }
    res.json(out);
  }));

  r.post('/hosts/:hostId/change-requests/:id/decision', wrap(async (req, res) => {
    const host = requireHost(req, param(req, 'hostId'));
    const body = decisionSchema.parse(req.body);
    res.json(await deps.bookings.decideRequest(param(req, 'id'), host.id, body.decision, body.note, body.startAt));
  }));

  r.post('/hosts/:hostId/bookings/:id/fee-paid', wrap(async (req, res) => {
    const host = requireHost(req, param(req, 'hostId'));
    res.json(await deps.bookings.markFeePaid(param(req, 'id'), host.id));
  }));

  // 承認済み・未払いのキャンセルフィーの支払い方法を講師が変更する
  r.post('/hosts/:hostId/bookings/:id/fee-method', wrap(async (req, res) => {
    const host = requireHost(req, param(req, 'hostId'));
    const body = z.object({ method: z.enum(FEE_METHODS) }).parse(req.body);
    res.json(await deps.bookings.changeFeeMethod(param(req, 'id'), host.id, body.method));
  }));

  // 主催者による取り消し(休講)。生徒へのメッセージ必須
  r.post('/hosts/:hostId/bookings/:id/cancel', wrap(async (req, res) => {
    const host = requireHost(req, param(req, 'hostId'));
    const body = hostCancelSchema.parse(req.body);
    res.json(await deps.bookings.cancelByHost(param(req, 'id'), host.id, body.reason));
  }));

  // ---- 課金・プラン ----

  r.get('/hosts/:hostId/billing', wrap(async (req, res) => {
    const host = requireHost(req, param(req, 'hostId'));
    const plan = effectivePlan(host);
    const limits = limitsFor(host);
    const { from, to } = monthRange(deps.clock.now(), host.timezone);
    const [bookingsThisMonth, calendars] = await Promise.all([
      repos.bookings.countConfirmedByHost(host.id, from, to),
      repos.hostCalendars.listByHost(host.id),
    ]);
    res.json({
      plan: host.plan,
      effectivePlan: plan,
      planLabel: PLAN_LABELS[plan],
      subscriptionStatus: host.subscriptionStatus,
      viaOrganization: isProViaOrganization(host),
      limits,
      usage: { bookingsThisMonth, calendars: calendars.length },
      publicUrl: `${deps.appBaseUrl}/#/h/${host.slug}`,
    });
  }));

  r.post('/hosts/:hostId/billing/checkout', wrap(async (req, res) => {
    const host = requireHost(req, param(req, 'hostId'));
    const body = billingUrlsSchema.parse(req.body);
    const url = await deps.billing.checkoutUrl(host, { success: body.successUrl, cancel: body.cancelUrl });
    res.json({ url });
  }));

  r.post('/hosts/:hostId/billing/portal', wrap(async (req, res) => {
    const host = requireHost(req, param(req, 'hostId'));
    const body = returnUrlSchema.parse(req.body);
    res.json({ url: await deps.billing.portalUrl(host, body.returnUrl) });
  }));

  // ---- キャンセルフィーのオンライン決済(講師の Stripe アカウント) ----

  r.get('/hosts/:hostId/connect', wrap(async (req, res) => {
    let host = requireHost(req, param(req, 'hostId'));
    host = await deps.fees.refreshStatus(host);
    res.json({
      available: limitsFor(host).onlineFeeCollection,
      accountId: host.stripeConnectAccountId,
      chargesEnabled: host.connectChargesEnabled,
      active: canCollectFeeOnline(host),
      cancellationFeeAmount: host.cancellationFeeAmount,
    });
  }));

  r.post('/hosts/:hostId/connect/onboarding', wrap(async (req, res) => {
    const host = requireHost(req, param(req, 'hostId'));
    const body = z.object({ refreshUrl: z.url(), returnUrl: z.url() }).parse(req.body);
    res.json({ url: await deps.fees.startOnboarding(host, body) });
  }));

  r.delete('/hosts/:hostId/connect', wrap(async (req, res) => {
    const host = requireHost(req, param(req, 'hostId'));
    await deps.fees.disconnect(host);
    res.status(204).end();
  }));

  if (deps.fakeBilling) {
    r.get('/billing/fake/connect-onboard', wrap(async (req, res) => {
      const q = z.object({ hostId: z.string(), accountId: z.string(), redirect: z.string() }).parse(req.query);
      await deps.fees.completeOnboardingForDev(q.hostId, q.accountId);
      res.redirect(q.redirect);
    }));
    r.get('/billing/fake/fee-paid', wrap(async (req, res) => {
      const q = z.object({ bookingId: z.string(), redirect: z.string() }).parse(req.query);
      await deps.fees.markPaidForDev(q.bookingId);
      res.redirect(q.redirect);
    }));
  }

  if (deps.fakeBilling) {
    // ローカル用: Checkout の代わりに即時有効化 / 解約して戻る
    r.get('/billing/fake/activate', wrap(async (req, res) => {
      const q = z.object({ hostId: z.string(), redirect: z.string() }).parse(req.query);
      await deps.billing.activateForDev(q.hostId);
      res.redirect(q.redirect);
    }));
    r.get('/billing/fake/cancel', wrap(async (req, res) => {
      const q = z.object({ hostId: z.string(), redirect: z.string() }).parse(req.query);
      await deps.billing.cancelForDev(q.hostId);
      res.redirect(q.redirect);
    }));
  }

  return r;
}

async function uniqueRandomSlug(repos: Repositories): Promise<string> {
  for (let i = 0; i < 5; i++) {
    const s = randomSlug();
    if (!(await repos.hosts.findBySlug(s))) return s;
  }
  return randomSlug(16);
}

/** 公開してよい主催者情報 */
function publicHost(h: Host) {
  return {
    id: h.id,
    slug: h.slug,
    displayName: h.displayName,
    bio: h.bio,
    timezone: h.timezone,
    lessonMinutes: h.lessonMinutes,
    rescheduleRangeDays: h.rescheduleRangeDays,
    lateChangeThresholdDays: h.lateChangeThresholdDays,
    bookingHorizonDays: h.bookingHorizonDays,
    cancellationFeeAmount: h.cancellationFeeAmount,
    onlineFeePayment: canCollectFeeOnline(h),
    /** 生徒が今選べる支払い方法(振込先そのものは公開しない) */
    feeMethods: availableFeeMethods(h),
  };
}

// ---------- 教室(組織)プラン ----------

const orgSchema = z.object({
  name: z.string().trim().min(1).max(100),
  slug: slugSchema,
  bio: z.string().trim().max(2000).optional(),
});

function organizationRoutes(deps: AppDeps): Router {
  const r = express.Router();
  const orgs = deps.organizations;

  // 公開: 教室ページ(所属講師の一覧)
  r.get('/orgs/by-slug/:slug', wrap(async (req, res) => {
    const { organization, members } = await orgs.publicPage(param(req, 'slug'));
    res.json({ slug: organization.slug, name: organization.name, bio: organization.bio, teachers: members.map(publicHost) });
  }));

  // 自分宛ての招待(講師登録前でも見られる)
  r.get('/me/invitations', wrap(async (req, res) => {
    const p = requirePrincipal(req);
    res.json(await orgs.myInvitations(p.email));
  }));

  r.post('/invitations/:id/accept', wrap(async (req, res) => {
    const host = requireHost(req);
    res.json(await orgs.accept(host, param(req, 'id')));
  }));

  r.post('/invitations/:id/decline', wrap(async (req, res) => {
    const p = requirePrincipal(req);
    await orgs.decline(p.email, param(req, 'id'));
    res.status(204).end();
  }));

  r.post('/orgs', wrap(async (req, res) => {
    const host = requireHost(req);
    res.status(201).json(await orgs.create(host, orgSchema.parse(req.body)));
  }));

  // 所属中の教室。管理者には所属講師のメールと招待中の一覧も返す
  r.get('/me/organization', wrap(async (req, res) => {
    const host = requireHost(req);
    const ov = await orgs.overview(host);
    if (!ov) {
      res.json(null);
      return;
    }
    res.json({
      organization: ov.organization,
      isOwner: ov.isOwner,
      publicUrl: `${deps.appBaseUrl}/#/o/${ov.organization.slug}`,
      members: ov.members.map((m) => ({
        ...publicHost(m),
        email: ov.isOwner ? m.email : undefined,
        isOwner: m.id === ov.organization.ownerHostId,
      })),
      invitations: ov.invitations,
    });
  }));

  r.post('/me/organization/leave', wrap(async (req, res) => {
    await orgs.leave(requireHost(req));
    res.status(204).end();
  }));

  r.patch('/orgs/:orgId', wrap(async (req, res) => {
    const body = orgSchema.partial().parse(req.body);
    const patch = Object.fromEntries(Object.entries(body).filter(([, v]) => v !== undefined));
    res.json(await orgs.update(requireHost(req), param(req, 'orgId'), patch));
  }));

  r.delete('/orgs/:orgId', wrap(async (req, res) => {
    await orgs.deleteOrganization(requireHost(req), param(req, 'orgId'));
    res.status(204).end();
  }));

  r.post('/orgs/:orgId/invitations', wrap(async (req, res) => {
    const body = z.object({ email: z.email('メールアドレスの形式が正しくありません') }).parse(req.body);
    res.status(201).json(await orgs.invite(requireHost(req), param(req, 'orgId'), body.email));
  }));

  r.delete('/orgs/:orgId/invitations/:id', wrap(async (req, res) => {
    await orgs.revokeInvitation(requireHost(req), param(req, 'orgId'), param(req, 'id'));
    res.status(204).end();
  }));

  r.delete('/orgs/:orgId/members/:hostId', wrap(async (req, res) => {
    await orgs.removeMember(requireHost(req), param(req, 'orgId'), param(req, 'hostId'));
    res.status(204).end();
  }));

  r.post('/orgs/:orgId/billing/checkout', wrap(async (req, res) => {
    const body = billingUrlsSchema.parse(req.body);
    res.json({ url: await orgs.checkoutUrl(requireHost(req), param(req, 'orgId'), { success: body.successUrl, cancel: body.cancelUrl }) });
  }));

  r.post('/orgs/:orgId/billing/portal', wrap(async (req, res) => {
    const body = returnUrlSchema.parse(req.body);
    res.json({ url: await orgs.portalUrl(requireHost(req), param(req, 'orgId'), body.returnUrl) });
  }));

  if (deps.fakeBilling) {
    r.get('/billing/fake/org-activate', wrap(async (req, res) => {
      const q = z.object({ orgId: z.string(), redirect: z.string() }).parse(req.query);
      await deps.billing.activateOrgForDev(q.orgId);
      res.redirect(q.redirect);
    }));
    r.get('/billing/fake/org-cancel', wrap(async (req, res) => {
      const q = z.object({ orgId: z.string(), redirect: z.string() }).parse(req.query);
      await deps.billing.cancelOrgForDev(q.orgId);
      res.redirect(q.redirect);
    }));
  }

  return r;
}

// ---------- 公開(ログイン任意) ----------

function publicRoutes(deps: AppDeps): Router {
  const r = express.Router();

  // 主催者の一覧は公開しない(各主催者が自分の予約ページ URL を生徒に共有する)
  r.get('/hosts/by-slug/:slug', wrap(async (req, res) => {
    const host = await deps.repos.hosts.findBySlug(param(req, 'slug').toLowerCase());
    if (!host) throw new DomainError('not_found', '予約ページが見つかりません');
    res.json(publicHost(host));
  }));

  r.get('/hosts/:hostId/public', wrap(async (req, res) => {
    const host = await deps.availability.getHost(param(req, 'hostId'));
    res.json(publicHost(host));
  }));

  r.get('/hosts/:hostId/slots', wrap(async (req, res) => {
    const q = slotsQuerySchema.parse(req.query);
    const slots = await deps.availability.listSlots(param(req, 'hostId'), q);
    const host = await deps.availability.getHost(param(req, 'hostId'));
    res.json({ slots, bookingHorizonDays: host.bookingHorizonDays });
  }));

  return r;
}

// ---------- 生徒用 ----------

function studentRoutes(deps: AppDeps): Router {
  const r = express.Router();
  const { repos } = deps;

  r.post('/bookings', wrap(async (req, res) => {
    const student = await requireStudent(req, repos);
    const body = createBookingSchema.parse(req.body);
    const booking = await deps.bookings.createBooking({ hostId: body.hostId, student, startAt: body.startAt, note: body.note });
    res.status(201).json(decorate(booking, deps.clock.now(), await repos.hosts.findById(booking.hostId)));
  }));

  r.get('/bookings', wrap(async (req, res) => {
    const student = await requireStudent(req, repos);
    const list = await repos.bookings.listByStudent(student.id);
    const now = deps.clock.now();
    const hosts = new Map<string, Host | null>();
    for (const b of list) if (!hosts.has(b.hostId)) hosts.set(b.hostId, await repos.hosts.findById(b.hostId));
    res.json(
      list.map((b) => {
        const host = hosts.get(b.hostId) ?? null;
        return { ...decorate(b, now, host), ...feeInfo(b, host) };
      }),
    );
  }));

  r.get('/bookings/:id', wrap(async (req, res) => {
    const student = await requireStudent(req, repos);
    const booking = await deps.bookings.getBookingForStudent(param(req, 'id'), student);
    const requests = await repos.changeRequests.listByBooking(booking.id);
    const host = await repos.hosts.findById(booking.hostId);
    res.json({
      ...decorate(booking, deps.clock.now(), host),
      ...feeInfo(booking, host),
      changeRequests: requests,
    });
  }));

  // 未払いのキャンセルフィーをオンラインで支払う(講師の Stripe アカウントへ直接)
  r.post('/bookings/:id/fee-checkout', wrap(async (req, res) => {
    const student = await requireStudent(req, repos);
    const body = successCancelSchema.parse(req.body);
    res.json({ url: await deps.fees.checkoutUrl(param(req, 'id'), student, body) });
  }));

  /**
   * キャンセル・変更。
   * 応答 200: 即時反映 { type: 'applied', booking }
   * 応答 202: 承認待ち   { type: 'pending_approval', booking, request }
   */
  r.post('/bookings/:id/change', wrap(async (req, res) => {
    const student = await requireStudent(req, repos);
    const body = changeSchema.parse(req.body);
    const outcome = await deps.bookings.requestChange({
      bookingId: param(req, 'id'),
      student,
      kind: body.kind,
      message: body.message,
      option: body.option,
      proposedStartAts: body.proposedStartAts ?? (body.proposedStartAt ? [body.proposedStartAt] : undefined),
      feeMethod: body.feeMethod,
    });
    res.status(outcome.type === 'applied' ? 200 : 202).json(outcome);
  }));

  return r;
}

// ---------- Google OAuth 連携(主催者) ----------

function googleRoutes(deps: AppDeps): Router {
  const r = express.Router();
  const google = deps.google;

  r.get('/hosts/:hostId/google/connect', wrap(async (req, res) => {
    const host = requireHost(req, param(req, 'hostId'));
    if (!google) throw new DomainError('calendar_error', 'CALENDAR=google が無効です');
    res.json({ url: google.authUrl(host.id, deps.clock.now()) });
  }));

  r.get('/hosts/:hostId/google/status', wrap(async (req, res) => {
    const host = requireHost(req, param(req, 'hostId'));
    const token = await deps.repos.googleCredentials.getRefreshToken(host.id);
    res.json({ connected: token !== null });
  }));

  r.delete('/hosts/:hostId/google', wrap(async (req, res) => {
    const host = requireHost(req, param(req, 'hostId'));
    if (google) await google.revoke(host.id);
    else await deps.repos.googleCredentials.clear(host.id);
    res.status(204).end();
  }));

  // Google からのリダイレクト先。state に hostId が入る
  r.get('/google/callback', wrap(async (req, res) => {
    if (!google) throw new DomainError('calendar_error', 'CALENDAR=google が無効です');
    const q = z.object({ code: z.string().min(1), state: z.string().min(1) }).parse(req.query);
    // state は署名付き。偽造・期限切れは handleCallback が拒否する
    const hostId = await google.handleCallback(q.state, q.code, deps.clock.now());
    if (!(await deps.repos.hosts.findById(hostId))) throw new DomainError('not_found', '主催者が見つかりません');
    res.type('text/plain').send('Google カレンダーと連携しました。この画面は閉じてかまいません。');
  }));

  return r;
}

// ---------- 共通 ----------

type FeeFields = { cancellationFeeStatus: string; cancellationFeeAmount: number | null; cancellationFeeMethod: string | null };

/** この予約の未払いキャンセルフィーをオンラインで払えるか */
function feePayable(b: FeeFields, host: Host | null): boolean {
  return (
    b.cancellationFeeStatus === 'pending' &&
    b.cancellationFeeMethod === 'card' &&
    b.cancellationFeeAmount !== null &&
    host !== null &&
    canCollectFeeOnline(host)
  );
}

/** 生徒向け: 支払い方法ごとに必要な情報。振込先は、振込で承認された未払いの予約にだけ付ける */
function feeInfo(b: FeeFields, host: Host | null): { feePayableOnline: boolean; bankTransferInfo?: string } {
  const out: { feePayableOnline: boolean; bankTransferInfo?: string } = { feePayableOnline: feePayable(b, host) };
  if (b.cancellationFeeStatus === 'pending' && b.cancellationFeeMethod === 'bank_transfer' && host?.bankTransferInfo.trim()) {
    out.bankTransferInfo = host.bankTransferInfo.trim();
  }
  return out;
}

/** 予約に「今の時点で直前変更扱いか」と講師のルールを付ける(クライアントの文言分岐用) */
function decorate<T extends { startAt: string; status: string }>(booking: T, now: Date, host: Host | null) {
  const threshold = host?.lateChangeThresholdDays ?? LATE_CHANGE_THRESHOLD_DAYS;
  return {
    ...booking,
    requiresApprovalToChange: booking.status === 'confirmed' && isLateChange(new Date(booking.startAt), now, threshold),
    lateChangeThresholdDays: threshold,
    rescheduleRangeDays: host?.rescheduleRangeDays ?? RESCHEDULE_RANGE_DAYS,
  };
}

function safeEqual(a: string, b: string): boolean {
  const ab = Buffer.from(a);
  const bb = Buffer.from(b);
  return ab.length === bb.length && timingSafeEqual(ab, bb);
}

function header(req: Request, name: string): string | undefined {
  const v = req.headers[name];
  return Array.isArray(v) ? v[0] : v;
}

function param(req: Request, name: string): string {
  const v = req.params[name];
  if (typeof v !== 'string' || v.length === 0) throw new DomainError('validation', `パラメータ ${name} が不正です`);
  return v;
}

type Handler = (req: Request, res: Response) => Promise<void>;

function wrap(fn: Handler) {
  return (req: Request, res: Response, next: NextFunction): void => {
    fn(req, res).catch(next);
  };
}

function errorHandler(err: unknown, _req: Request, res: Response, _next: NextFunction): void {
  if (err instanceof DomainError) {
    res.status(err.status).json({ error: { code: err.code, message: err.message, details: err.details } });
    return;
  }
  if (err instanceof z.ZodError) {
    res.status(400).json({
      error: {
        code: 'validation',
        message: '入力内容に誤りがあります',
        details: err.issues.map((i) => ({ path: i.path.join('.'), message: i.message })),
      },
    });
    return;
  }
  if (isBodyParseError(err)) {
    res.status(400).json({ error: { code: 'validation', message: 'JSON の形式が不正です' } });
    return;
  }
  console.error(err);
  res.status(500).json({ error: { code: 'internal', message: 'サーバー内部でエラーが発生しました' } });
}

function isBodyParseError(err: unknown): boolean {
  return typeof err === 'object' && err !== null && (err as { type?: string }).type === 'entity.parse.failed';
}
