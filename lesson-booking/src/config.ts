import { z } from 'zod';

const schema = z.object({
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
  WEB_DIST: z.string().default('web/dist'),
  /** フロントエンドの公開 URL(末尾スラッシュなし)。公開予約ページ URL・課金のリダイレクト先に使う */
  APP_BASE_URL: z.string().default('http://localhost:8787'),
  SERVICE_NAME: z.string().default('レッスン予約'),
  /** console: 標準出力に出すだけ / resend: Resend で送信 */
  MAIL: z.enum(['console', 'resend']).default('console'),
  RESEND_API_KEY: z.string().default(''),
  /** 例: "レッスン予約 <noreply@example.com>"。ドメインは Resend で認証済みであること */
  MAIL_FROM: z.string().default(''),
  BILLING: z.enum(['fake', 'stripe']).default('fake'),
  STRIPE_SECRET_KEY: z.string().default(''),
  STRIPE_WEBHOOK_SECRET: z.string().default(''),
  STRIPE_PRICE_ID_PRO: z.string().default(''),
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
  }
  if (cfg.MAIL === 'resend') {
    if (!cfg.RESEND_API_KEY) missing.push('RESEND_API_KEY');
    if (!cfg.MAIL_FROM) missing.push('MAIL_FROM');
  }
  if (cfg.BILLING === 'stripe') {
    for (const k of ['STRIPE_SECRET_KEY', 'STRIPE_WEBHOOK_SECRET', 'STRIPE_PRICE_ID_PRO'] as const) if (!cfg[k]) missing.push(k);
  }
  if (missing.length > 0) {
    throw new Error(`環境変数が不足しています: ${missing.join(', ')}`);
  }
  return cfg;
}
