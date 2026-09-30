import { FakeCalendarClient } from './calendar/FakeCalendarClient.js';
import { GoogleCalendarClient } from './calendar/GoogleCalendarClient.js';
import { loadConfig } from './config.js';
import { createApp } from './http/app.js';
import { createInMemoryRepositories, systemClock } from './repo/InMemoryRepositories.js';
import { createSupabaseRepositories } from './repo/SupabaseRepositories.js';
import { AvailabilityService } from './services/AvailabilityService.js';
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

const app = createApp({
  repos,
  calendar,
  availability,
  bookings,
  clock: systemClock,
  auth: cfg.AUTH_MODE === 'supabase' ? { mode: 'supabase', jwtSecret: cfg.SUPABASE_JWT_SECRET } : { mode: 'dev' },
  google,
  defaultTimezone: cfg.TIMEZONE,
});

app.listen(cfg.PORT, () => {
  console.log(
    `[lesson-booking] listening on http://localhost:${cfg.PORT} (auth=${cfg.AUTH_MODE}, storage=${cfg.STORAGE}, calendar=${cfg.CALENDAR})`,
  );
});
