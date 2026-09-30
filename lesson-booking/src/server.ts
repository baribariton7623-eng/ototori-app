import path from 'node:path';
import { FakeBillingProvider } from './billing/FakeBillingProvider.js';
import { StripeBillingProvider } from './billing/StripeBillingProvider.js';
import { FakeCalendarClient } from './calendar/FakeCalendarClient.js';
import { GoogleCalendarClient } from './calendar/GoogleCalendarClient.js';
import { loadConfig } from './config.js';
import { createApp } from './http/app.js';
import { createInMemoryRepositories, systemClock } from './repo/InMemoryRepositories.js';
import { createSupabaseRepositories } from './repo/SupabaseRepositories.js';
import { AvailabilityService } from './services/AvailabilityService.js';
import { BillingService } from './services/BillingService.js';
import { BookingService } from './services/BookingService.js';

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

const availability = new AvailabilityService(repos, calendar, systemClock);
const bookings = new BookingService(repos, calendar, availability, systemClock);

const billingProvider =
  cfg.BILLING === 'stripe'
    ? new StripeBillingProvider(
        { secretKey: cfg.STRIPE_SECRET_KEY, webhookSecret: cfg.STRIPE_WEBHOOK_SECRET, proPriceId: cfg.STRIPE_PRICE_ID_PRO },
        repos.hosts,
      )
    : new FakeBillingProvider(cfg.APP_BASE_URL);
const billing = new BillingService(repos, billingProvider);

const app = createApp({
  repos,
  calendar,
  availability,
  bookings,
  billing,
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
    `[lesson-booking] listening on http://localhost:${cfg.PORT} (auth=${cfg.AUTH_MODE}, storage=${cfg.STORAGE}, calendar=${cfg.CALENDAR}, billing=${cfg.BILLING})`,
  );
});
