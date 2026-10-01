import { z } from 'zod';
import { isValidTimeZone } from './domain/time.js';

const schema = z.object({
  NODE_ENV: z.string().default('development'),
  /**
   * 開発・E2E 専用: サーバーの「今」をこの時刻から始める(以後は実時間で進む)。
   * 本番(NODE_ENV=production)では起動を拒否する
   */
  FAKE_NOW: z.string().default(''),
  PORT: z.coerce.number().int().positive().default(8787),
  AUTH_MODE: z.enum(['dev', 'supabase']).default('dev'),
  STORAGE: z.enum(['memory', 'supabase']).default('memory'),
  CALENDAR: z.enum(['fake', 'google']).default('fake'),
  TIMEZONE: z.string().default('Asia/Tokyo'),
  SUPABASE_URL: z.string().default(''),
  SUPABASE_SERVICE_ROLE_KEY: z.string().default(''),
  SUPABASE_JWT_SECRET: z.string().default(''),
  GOOGLE_CLIENT_ID: z.string().default(''),
  GOOGLE_CLIENT_SECRET: z.string().default(''),
  GOOGLE_REDIRECT_URI: z.string().default('http://localhost:8787/google/callback'),
  /** Google 連携の state に署名する鍵(32 文字以上推奨)。開発時は未設定なら起動ごとにランダム */
  OAUTH_STATE_SECRET: z.string().default(''),
  WEB_DIST: z.string().default('web/dist'),
  /** フロントエンドの公開 URL(末尾スラッシュなし)。公開予約ページ URL・課金のリダイレクト先に使う */
  APP_BASE_URL: z.string().default('http://localhost:8787'),
  SERVICE_NAME: z.string().default('レッスン予約'),
  /** console: 標準出力に出すだけ / resend: Resend で送信 */
  MAIL: z.enum(['console', 'resend']).default('console'),
  RESEND_API_KEY: z.string().default(''),
  /** 例: "レッスン予約 <noreply@example.com>"。ドメインは Resend で認証済みであること */
  MAIL_FROM: z.string().default(''),
  /** POST /internal/cron/reminders の x-cron-secret。空ならエンドポイント無効 */
  CRON_SECRET: z.string().default(''),
  /** 何時間前にリマインドするか */
  REMINDER_HOURS_BEFORE: z.coerce.number().int().min(1).max(168).default(24),
  /** >0 ならサーバー内で N 分ごとにリマインドを実行(サーバーが 1 台のときだけ使う) */
  REMINDER_INTERVAL_MINUTES: z.coerce.number().int().min(0).default(0),
  BILLING: z.enum(['fake', 'stripe']).default('fake'),
  STRIPE_SECRET_KEY: z.string().default(''),
  STRIPE_WEBHOOK_SECRET: z.string().default(''),
  STRIPE_PRICE_ID_PRO: z.string().default(''),
  /** 教室プランの Price ID(講師 1 人あたり月額)。空なら教室プランの契約ボタンはエラーになる */
  STRIPE_PRICE_ID_ORG_SEAT: z.string().default(''),
  /** Connect(連結アカウント)イベント用 Webhook の署名シークレット。キャンセルフィー決済に使う */
  STRIPE_CONNECT_WEBHOOK_SECRET: z.string().default(''),
});

export type Config = z.infer<typeof schema>;

export function loadConfig(env: NodeJS.ProcessEnv = process.env): Config {
  const cfg = schema.parse(env);
  const missing: string[] = [];
  if (cfg.STORAGE === 'supabase') {
    if (!cfg.SUPABASE_URL) missing.push('SUPABASE_URL');
    if (!cfg.SUPABASE_SERVICE_ROLE_KEY) missing.push('SUPABASE_SERVICE_ROLE_KEY');
  }
  if (cfg.AUTH_MODE === 'supabase' && !cfg.SUPABASE_JWT_SECRET) missing.push('SUPABASE_JWT_SECRET');
  if (cfg.CALENDAR === 'google') {
    if (!cfg.GOOGLE_CLIENT_ID) missing.push('GOOGLE_CLIENT_ID');
    if (!cfg.GOOGLE_CLIENT_SECRET) missing.push('GOOGLE_CLIENT_SECRET');
    if (cfg.NODE_ENV === 'production' && cfg.OAUTH_STATE_SECRET.length < 32) missing.push('OAUTH_STATE_SECRET(32 文字以上)');
  }
  if (cfg.MAIL === 'resend') {
    if (!cfg.RESEND_API_KEY) missing.push('RESEND_API_KEY');
    if (!cfg.MAIL_FROM) missing.push('MAIL_FROM');
  }
  if (cfg.BILLING === 'stripe') {
    for (const k of ['STRIPE_SECRET_KEY', 'STRIPE_WEBHOOK_SECRET', 'STRIPE_PRICE_ID_PRO', 'STRIPE_CONNECT_WEBHOOK_SECRET'] as const) {
      if (!cfg[k]) missing.push(k);
    }
  }
  if (!isValidTimeZone(cfg.TIMEZONE)) throw new Error(`TIMEZONE が不正です: ${cfg.TIMEZONE}`);
  if (cfg.FAKE_NOW && Number.isNaN(Date.parse(cfg.FAKE_NOW))) {
    throw new Error(`FAKE_NOW の日時が不正です: ${cfg.FAKE_NOW}`);
  }
  if (missing.length > 0) {
    throw new Error(`環境変数が不足しています: ${missing.join(', ')}`);
  }
  const { errors } = productionProblems(cfg);
  if (errors.length > 0) {
    throw new Error(`本番(NODE_ENV=production)では起動できない設定です:\n- ${errors.join('\n- ')}`);
  }
  return cfg;
}

/**
 * 本番で危険な設定の検出。
 * errors: 起動を拒否する(なりすまし・データ消失・無料でプロになれる等)
 * warnings: 起動はするがログに出す(機能が動かない設定)
 */
export function productionProblems(cfg: Config): { errors: string[]; warnings: string[] } {
  const errors: string[] = [];
  const warnings: string[] = [];
  if (cfg.NODE_ENV !== 'production') return { errors, warnings };
  if (cfg.AUTH_MODE !== 'supabase') {
    errors.push('AUTH_MODE=dev は使えません(ヘッダにメールアドレスを書くだけで誰にでもなりすませます)。AUTH_MODE=supabase にしてください');
  }
  if (cfg.STORAGE !== 'supabase') errors.push('STORAGE=memory は使えません(再起動でデータが消えます)。STORAGE=supabase にしてください');
  if (cfg.BILLING !== 'stripe') {
    errors.push('BILLING=fake は使えません(誰でも無料でプロプランにできる開発用エンドポイントが有効になります)。BILLING=stripe にしてください');
  }
  if (cfg.FAKE_NOW) errors.push('FAKE_NOW は開発・E2E 専用です。本番では設定しないでください');
  if (!cfg.APP_BASE_URL.startsWith('https://')) errors.push(`APP_BASE_URL は https の URL にしてください(現在: ${cfg.APP_BASE_URL})`);
  if (cfg.CALENDAR !== 'google') warnings.push('CALENDAR=fake のため、Google カレンダーと連携しません');
  if (cfg.MAIL !== 'resend') warnings.push('MAIL=console のため、通知メールは送信されません(ログに出るだけ)');
  if (!cfg.CRON_SECRET && cfg.REMINDER_INTERVAL_MINUTES === 0) {
    warnings.push('CRON_SECRET も REMINDER_INTERVAL_MINUTES も未設定のため、前日リマインドが送られません');
  }
  return { errors, warnings };
}
