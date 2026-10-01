-- 講師ごとの振替期間(元のレッスン日から前後の日数)
alter table lb_hosts
  add column if not exists reschedule_range_days integer not null default 7
    check (reschedule_range_days between 1 and 30);
