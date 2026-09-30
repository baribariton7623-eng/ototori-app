import express, { type NextFunction, type Request, type Response, type Router } from 'express';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { z } from 'zod';
import type { CalendarClient } from '../calendar/CalendarClient.js';
import type { GoogleCalendarClient } from '../calendar/GoogleCalendarClient.js';
import { DomainError } from '../domain/errors.js';
import { PLAN_LABELS, PLAN_LIMITS, SLUG_PATTERN, effectivePlan, limitsFor, randomSlug } from '../domain/plans.js';
import { monthRange } from '../domain/time.js';
import type { Host } from '../domain/types.js';
import {
  BOOKING_HORIZON_DAYS,
  LATE_CHANGE_OPTION_LABELS,
  LATE_CHANGE_OPTIONS,
  LATE_CHANGE_THRESHOLD_DAYS,
  RESCHEDULE_RANGE_DAYS,
  isLateChange,
} from '../domain/rules.js';
import { isValidTimeString, timeStringToMinutes } from '../domain/time.js';
import type { Clock } from '../repo/InMemoryRepositories.js';
import type { Repositories } from '../repo/Repository.js';
import type { AvailabilityService } from '../services/AvailabilityService.js';
import type { BillingService } from '../services/BillingService.js';
import type { BookingService } from '../services/BookingService.js';
import { authMiddleware, requireHost, requirePrincipal, requireStudent, type AuthMode } from './auth.js';

export interface AppDeps {
  repos: Repositories;
  calendar: CalendarClient;
  availability: AvailabilityService;
  bookings: BookingService;
  billing: BillingService;
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

// ---------- 入力スキーマ ----------

const isoDate = z.iso.datetime({ offset: true }).transform((s) => new Date(s));
const timeString = z.string().refine(isValidTimeString, 'HH:MM 形式で指定してください');

const slugSchema = z.string().trim().toLowerCase().regex(SLUG_PATTERN, '英小文字・数字・ハイフンで3〜32文字');
const createHostSchema = z.object({
  displayName: z.string().trim().min(1).max(100),
  slug: slugSchema.optional(),
  bio: z.string().trim().max(2000).optional(),
  timezone: z.string().trim().min(1).optional(),
  lessonMinutes: z.number().int().min(5).max(24 * 60).optional(),
  minLeadMinutes: z.number().int().min(0).max(30 * 24 * 60).optional(),
});
const patchHostSchema = createHostSchema.partial();
const billingUrlsSchema = z.object({
  successUrl: z.url(),
  cancelUrl: z.url(),
});
const returnUrlSchema = z.object({ returnUrl: z.url() });

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
  proposedStartAt: isoDate.optional(),
});

const decisionSchema = z.object({
  decision: z.enum(['approve', 'reject']),
  note: z.string().trim().max(2000).optional(),
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

  app.use(express.json({ limit: '100kb' }));
  app.use(authMiddleware(deps.repos, deps.auth));

  app.get('/health', (_req, res) => {
    res.json({ ok: true, now: deps.clock.now().toISOString() });
  });

  /** クライアントが表示に使う業務ルール定数 */
  app.get('/rules', (_req, res) => {
    res.json({
      bookingHorizonDays: BOOKING_HORIZON_DAYS,
      lateChangeThresholdDays: LATE_CHANGE_THRESHOLD_DAYS,
      rescheduleRangeDays: RESCHEDULE_RANGE_DAYS,
      lateChangeOptions: LATE_CHANGE_OPTIONS.map((value) => ({ value, label: LATE_CHANGE_OPTION_LABELS[value] })),
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

  app.use(hostRoutes(deps));
  app.use(publicRoutes(deps));
  app.use(studentRoutes(deps));
  app.use(googleRoutes(deps));

  if (deps.staticDir && existsSync(path.join(deps.staticDir, 'index.html'))) {
    app.use(express.static(deps.staticDir));
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
      timezone: body.timezone ?? deps.defaultTimezone,
      lessonMinutes: body.lessonMinutes ?? 60,
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
        optionLabel: LATE_CHANGE_OPTION_LABELS[c.option],
        booking,
        student: student ? { id: student.id, email: student.email, name: student.name } : null,
      });
    }
    res.json(out);
  }));

  r.post('/hosts/:hostId/change-requests/:id/decision', wrap(async (req, res) => {
    const host = requireHost(req, param(req, 'hostId'));
    const body = decisionSchema.parse(req.body);
    res.json(await deps.bookings.decideRequest(param(req, 'id'), host.id, body.decision, body.note));
  }));

  r.post('/hosts/:hostId/bookings/:id/fee-paid', wrap(async (req, res) => {
    const host = requireHost(req, param(req, 'hostId'));
    res.json(await deps.bookings.markFeePaid(param(req, 'id'), host.id));
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
  return { id: h.id, slug: h.slug, displayName: h.displayName, bio: h.bio, timezone: h.timezone, lessonMinutes: h.lessonMinutes };
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
    res.json({ slots, bookingHorizonDays: BOOKING_HORIZON_DAYS });
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
    res.status(201).json(decorate(booking, deps.clock.now()));
  }));

  r.get('/bookings', wrap(async (req, res) => {
    const student = await requireStudent(req, repos);
    const list = await repos.bookings.listByStudent(student.id);
    const now = deps.clock.now();
    res.json(list.map((b) => decorate(b, now)));
  }));

  r.get('/bookings/:id', wrap(async (req, res) => {
    const student = await requireStudent(req, repos);
    const booking = await deps.bookings.getBookingForStudent(param(req, 'id'), student);
    const requests = await repos.changeRequests.listByBooking(booking.id);
    res.json({ ...decorate(booking, deps.clock.now()), changeRequests: requests });
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
      proposedStartAt: body.proposedStartAt,
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
    res.json({ url: google.authUrl(host.id) });
  }));

  r.get('/hosts/:hostId/google/status', wrap(async (req, res) => {
    const host = requireHost(req, param(req, 'hostId'));
    const token = await deps.repos.googleCredentials.getRefreshToken(host.id);
    res.json({ connected: token !== null });
  }));

  r.delete('/hosts/:hostId/google', wrap(async (req, res) => {
    const host = requireHost(req, param(req, 'hostId'));
    await deps.repos.googleCredentials.clear(host.id);
    res.status(204).end();
  }));

  // Google からのリダイレクト先。state に hostId が入る
  r.get('/google/callback', wrap(async (req, res) => {
    if (!google) throw new DomainError('calendar_error', 'CALENDAR=google が無効です');
    const q = z.object({ code: z.string().min(1), state: z.string().min(1) }).parse(req.query);
    await google.handleCallback(q.state, q.code);
    res.type('text/plain').send('Google カレンダーと連携しました。この画面は閉じてかまいません。');
  }));

  return r;
}

// ---------- 共通 ----------

/** 予約に「今の時点で直前変更扱いか」を付ける(クライアントの文言分岐用) */
function decorate<T extends { startAt: string; status: string }>(booking: T, now: Date) {
  return {
    ...booking,
    requiresApprovalToChange: booking.status === 'confirmed' && isLateChange(new Date(booking.startAt), now),
  };
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
