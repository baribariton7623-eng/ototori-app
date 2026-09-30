-- 前日リマインド
alter table lb_bookings add column if not exists reminder_sent_at timestamptz;
create index if not exists lb_bookings_reminder_due
  on lb_bookings(start_at) where status = 'confirmed' and reminder_sent_at is null;
