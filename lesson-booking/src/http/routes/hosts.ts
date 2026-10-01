import express, { type Router } from 'express';
import { z } from 'zod';
import { DomainError } from '../../domain/errors.js';
import {
  canCollectFeeOnline,
  effectivePlan,
  isProViaOrganization,
  limitsFor,
  MIN_FEE_JPY,
  PLAN_LABELS,
  randomSlug,
} from '../../domain/plans.js';
import { monthRange } from '../../domain/time.js';
import {
  BOOKING_HORIZON_DAYS,
  DEFAULT_RESCHEDULE_RANGE_DAYS,
  FEE_METHOD_LABELS,
  FEE_METHODS,
  LATE_CHANGE_THRESHOLD_DAYS,
  lateChangeOptionLabel,
  MAX_BOOKING_HORIZON_DAYS,
  MAX_LATE_CHANGE_THRESHOLD_DAYS,
  MAX_RESCHEDULE_RANGE_DAYS,
  MIN_BOOKING_HORIZON_DAYS,
  MIN_LATE_CHANGE_THRESHOLD_DAYS,
  MIN_RESCHEDULE_RANGE_DAYS,
} from '../../domain/rules.js';
import { isValidTimeString, isValidTimeZone, timeStringToMinutes } from '../../domain/time.js';
import type { Repositories } from '../../repo/Repository.js';
import { requireHost, requirePrincipal } from '../auth.js';
import type { AppDeps } from '../app.js';
import { billingUrlsSchema, isoDate, listSince, param, returnUrlSchema, slugSchema, studentsById, wrap } from '../common.js';

// ---------- 主催者(講師)用 ----------

const timeString = z.string().refine(isValidTimeString, 'HH:MM 形式で指定してください');
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
const hostCancelSchema = z.object({ reason: z.string().trim().min(1, '生徒へのメッセージを入力してください').max(2000) });
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
const decisionSchema = z.object({
  decision: z.enum(['approve', 'reject']),
  note: z.string().trim().max(2000).optional(),
  /** 振替の承認時、希望日時の中から選んだ振替先(候補が 1 つなら省略可) */
  startAt: isoDate.optional(),
});

export function hostRoutes(deps: AppDeps): Router {
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
      rescheduleRangeDays: body.rescheduleRangeDays ?? DEFAULT_RESCHEDULE_RANGE_DAYS,
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
    const list = await repos.bookings.listByHost(host.id, { since: listSince(req, deps.clock.now()) });
    const students = await studentsById(repos, list.map((b) => b.studentId));
    res.json(list.map((b) => ({ ...b, student: students.get(b.studentId) ?? null })));
  }));

  // タブのバッジ用。一覧と違い、空き確認(Google への問い合わせ)や予約・生徒の取得をしない
  r.get('/hosts/:hostId/change-requests/count', wrap(async (req, res) => {
    const host = requireHost(req, param(req, 'hostId'));
    res.json({ pending: (await repos.changeRequests.listByHost(host.id, 'pending')).length });
  }));

  r.get('/hosts/:hostId/change-requests', wrap(async (req, res) => {
    const host = requireHost(req, param(req, 'hostId'));
    const status = typeof req.query.status === 'string' ? req.query.status : 'pending';
    const parsed = z.enum(['pending', 'approved', 'rejected', 'all']).parse(status);
    const list = await repos.changeRequests.listByHost(host.id, parsed === 'all' ? undefined : parsed);
    const [bookings, students, candidates] = await Promise.all([
      Promise.all([...new Set(list.map((c) => c.bookingId))].map((id) => repos.bookings.findById(id))),
      studentsById(repos, list.map((c) => c.studentId)),
      deps.bookings.candidateAvailability(host, list),
    ]);
    const bookingById = new Map(bookings.flatMap((b) => (b ? [[b.id, b] as const] : [])));
    res.json(
      list.map((c) => ({
        ...c,
        optionLabel: lateChangeOptionLabel(c.option, host.rescheduleRangeDays),
        feeMethodLabel: c.feeMethod ? FEE_METHOD_LABELS[c.feeMethod] : null,
        candidates: candidates.get(c.id) ?? [],
        booking: bookingById.get(c.bookingId) ?? null,
        student: students.get(c.studentId) ?? null,
      })),
    );
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
