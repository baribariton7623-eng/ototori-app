-- 振替の希望日時を第1〜第3希望まで持てるようにし、講師が承認時に選んだ日時を記録する

alter table lb_change_requests
  add column if not exists proposed_start_ats timestamptz[] not null default '{}',
  add column if not exists approved_start_at timestamptz;

-- 既存データの移行: 単一の希望日時を第1希望に、承認済みの振替は承認先として記録
update lb_change_requests
  set proposed_start_ats = array[proposed_start_at]
  where proposed_start_at is not null and cardinality(proposed_start_ats) = 0;
update lb_change_requests
  set approved_start_at = proposed_start_at
  where kind = 'reschedule' and status = 'approved' and approved_start_at is null;

alter table lb_change_requests
  add constraint lb_change_requests_candidates_max check (cardinality(proposed_start_ats) <= 3);

alter table lb_change_requests drop column if exists proposed_start_at;
