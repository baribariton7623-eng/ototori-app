-- 講師ごとのルール: 承認制にする日数(開始の何日前から)と、予約を受け付ける期間(何日先まで)
alter table lb_hosts
  add column if not exists late_change_threshold_days integer not null default 14
    check (late_change_threshold_days between 0 and 90),
  add column if not exists booking_horizon_days integer not null default 40
    check (booking_horizon_days between 1 and 180);
