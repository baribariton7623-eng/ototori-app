import express from 'express';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { z } from 'zod';
import type { CalendarClient } from '../calendar/CalendarClient.js';
import type { GoogleCalendarClient } from '../calendar/GoogleCalendarClient.js';
import { DomainError } from '../domain/errors.js';
import { PLAN_LABELS, PLAN_LIMITS } from '../domain/plans.js';
import {
  BOOKING_HORIZON_DAYS,
  DEFAULT_RESCHEDULE_RANGE_DAYS,
  FEE_METHOD_LABELS,
  FEE_METHODS,
  LATE_CHANGE_OPTION_LABELS,
  LATE_CHANGE_OPTIONS,
  LATE_CHANGE_THRESHOLD_DAYS,
  MAX_BOOKING_HORIZON_DAYS,
  MAX_LATE_CHANGE_THRESHOLD_DAYS,
  MAX_RESCHEDULE_RANGE_DAYS,
  MIN_BOOKING_HORIZON_DAYS,
  MIN_LATE_CHANGE_THRESHOLD_DAYS,
  MIN_RESCHEDULE_RANGE_DAYS,
} from '../domain/rules.js';
import type { Clock } from '../repo/InMemoryRepositories.js';
import type { Repositories } from '../repo/Repository.js';
import type { AccountService } from '../services/AccountService.js';
import type { AvailabilityService } from '../services/AvailabilityService.js';
import type { BillingService } from '../services/BillingService.js';
import type { BookingService } from '../services/BookingService.js';
import type { FeeService } from '../services/FeeService.js';
import type { OrganizationService } from '../services/OrganizationService.js';
import type { ReminderService } from '../services/ReminderService.js';
import { authMiddleware, type AuthMode, requirePrincipal } from './auth.js';
import { errorHandler, header, safeEqual, wrap } from './common.js';
import { googleRoutes } from './routes/google.js';
import { hostRoutes } from './routes/hosts.js';
import { organizationRoutes } from './routes/organizations.js';
import { publicRoutes } from './routes/public.js';
import { studentRoutes } from './routes/students.js';

/**
 * HTTP API の組み立て。エンドポイントは利用者ごとに routes/ に分けている
 * (hosts: 講師、students: 生徒、organizations: 教室、public: 公開、google: カレンダー連携)。
 * ここには Webhook・cron・ルール・ログイン中ユーザー(/me)など、全体にかかわるものだけを置く
 */
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

const deleteAccountSchema = z.object({ confirm: z.string().trim().min(1) });

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
      rescheduleRangeDays: DEFAULT_RESCHEDULE_RANGE_DAYS,
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
