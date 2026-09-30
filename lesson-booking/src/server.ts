import path from 'node:path';
import { createClient } from '@supabase/supabase-js';
import { FakeBillingProvider } from './billing/FakeBillingProvider.js';
import { FakeFeePaymentProvider } from './billing/FakeFeePaymentProvider.js';
import { StripeBillingProvider } from './billing/StripeBillingProvider.js';
import { StripeFeePaymentProvider } from './billing/StripeFeePaymentProvider.js';
import { FakeCalendarClient } from './calendar/FakeCalendarClient.js';
import { GoogleCalendarClient } from './calendar/GoogleCalendarClient.js';
import { loadConfig } from './config.js';
import { createApp } from './http/app.js';
import { ConsoleEmailSender, ResendEmailSender } from './notify/EmailSender.js';
import { EmailNotifier } from './notify/EmailNotifier.js';
import { createInMemoryRepositories, systemClock } from './repo/InMemoryRepositories.js';
import { createSupabaseRepositories } from './repo/SupabaseRepositories.js';
import { AccountService, type AccountCleanup } from './services/AccountService.js';
import { AvailabilityService } from './services/AvailabilityService.js';
import { BillingService } from './services/BillingService.js';
import { BookingService } from './services/BookingService.js';
import { FeeService } from './services/FeeService.js';
import { ReminderService } from './services/ReminderService.js';

const cfg = loadConfig();

const repos =
  cfg.STORAGE === 'supabase'
    ? createSupabaseRepositories(cfg.SUPABASE_URL, cfg.SUPABASE_SERVICE_ROLE_KEY)
    : createInMemoryRepositories(systemClock);

const google =
  cfg.CALENDAR === 'google'
    ? new GoogleCalendarClient(
        { clientId: cfg.GOOGLE_CLIENT_ID, clientSecret: cfg.GOOGLE_CLIENT_SECRET, redirectUri: cfg.GOOGLE_REDIRECT_URI },
        repos.googleCredentials,
      )
    : undefined;
const calendar = google ?? new FakeCalendarClient();

const mailSender = cfg.MAIL === 'resend' ? new ResendEmailSender(cfg.RESEND_API_KEY, cfg.MAIL_FROM) : new ConsoleEmailSender();
const notifier = new EmailNotifier(mailSender, { serviceName: cfg.SERVICE_NAME, appBaseUrl: cfg.APP_BASE_URL });

const availability = new AvailabilityService(repos, calendar, systemClock);
const bookings = new BookingService(repos, calendar, availability, systemClock, notifier);

const billingProvider =
  cfg.BILLING === 'stripe'
    ? new StripeBillingProvider(
        { secretKey: cfg.STRIPE_SECRET_KEY, webhookSecret: cfg.STRIPE_WEBHOOK_SECRET, proPriceId: cfg.STRIPE_PRICE_ID_PRO },
        repos.hosts,
      )
    : new FakeBillingProvider(cfg.APP_BASE_URL);
const billing = new BillingService(repos, billingProvider);
const feeProvider =
  cfg.BILLING === 'stripe'
    ? new StripeFeePaymentProvider(cfg.STRIPE_SECRET_KEY, cfg.STRIPE_CONNECT_WEBHOOK_SECRET)
    : new FakeFeePaymentProvider(cfg.APP_BASE_URL);
const fees = new FeeService(repos, feeProvider, notifier);

// 退会時の外部サービス後始末
const supabaseAdmin =
  cfg.AUTH_MODE === 'supabase' && cfg.SUPABASE_URL && cfg.SUPABASE_SERVICE_ROLE_KEY
    ? createClient(cfg.SUPABASE_URL, cfg.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } })
    : null;
const cleanup: AccountCleanup = {
  async revokeGoogle(hostId) {
    if (google) await google.revoke(hostId);
    else await repos.googleCredentials.clear(hostId);
  },
  async deleteAuthUser(subject) {
    if (!supabaseAdmin) return;
    const { error } = await supabaseAdmin.auth.admin.deleteUser(subject);
    if (error) console.error('[account] Supabase Auth ユーザーの削除に失敗しました', error.message);
  },
};
const accounts = new AccountService(repos, bookings, billing, cleanup, systemClock);
const reminders = new ReminderService(repos, notifier, systemClock, cfg.REMINDER_HOURS_BEFORE);

if (cfg.REMINDER_INTERVAL_MINUTES > 0) {
  const run = () =>
    reminders
      .runOnce()
      .then((r) => r.checked > 0 && console.log('[reminder]', r))
      .catch((e) => console.error('[reminder] 実行に失敗しました', e));
  setInterval(run, cfg.REMINDER_INTERVAL_MINUTES * 60_000).unref();
  void run();
}

const app = createApp({
  repos,
  calendar,
  availability,
  bookings,
  billing,
  accounts,
  reminders,
  fees,
  cronSecret: cfg.CRON_SECRET,
  fakeBilling: cfg.BILLING === 'fake',
  clock: systemClock,
  auth: cfg.AUTH_MODE === 'supabase' ? { mode: 'supabase', jwtSecret: cfg.SUPABASE_JWT_SECRET } : { mode: 'dev' },
  google,
  defaultTimezone: cfg.TIMEZONE,
  appBaseUrl: cfg.APP_BASE_URL,
  staticDir: path.resolve(process.cwd(), cfg.WEB_DIST),
});

app.listen(cfg.PORT, () => {
  console.log(
    `[lesson-booking] listening on http://localhost:${cfg.PORT} (auth=${cfg.AUTH_MODE}, storage=${cfg.STORAGE}, calendar=${cfg.CALENDAR}, billing=${cfg.BILLING}, mail=${cfg.MAIL})`,
  );
});
