-- 講師ごとのルールの上限を変更
--   承認制にする時期(開始の何日前から): 0〜90 → 0〜60
--   予約を受け付ける期間(何日先まで):   1〜180 → 1〜60

-- 既に上限を超える値が保存されていれば上限に揃える
update lb_hosts set late_change_threshold_days = 60 where late_change_threshold_days > 60;
update lb_hosts set booking_horizon_days = 60 where booking_horizon_days > 60;

-- 0009 で列定義に付けた CHECK(既定名)を外し、新しい範囲で付け直す
alter table lb_hosts drop constraint if exists lb_hosts_late_change_threshold_days_check;
alter table lb_hosts drop constraint if exists lb_hosts_booking_horizon_days_check;
alter table lb_hosts add constraint lb_hosts_late_change_threshold_days_check
  check (late_change_threshold_days between 0 and 60);
alter table lb_hosts add constraint lb_hosts_booking_horizon_days_check
  check (booking_horizon_days between 1 and 60);
