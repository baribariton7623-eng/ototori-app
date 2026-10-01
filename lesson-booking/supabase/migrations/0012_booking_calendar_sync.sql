-- Google カレンダーへの反映(作成・日時変更・削除)に失敗した予約を記録する。
-- null なら反映済みか反映不要。講師の予約一覧に表示し、定期実行(/internal/cron/reminders)と講師の操作で再試行する。
alter table lb_bookings add column calendar_sync_error text;

create index lb_bookings_calendar_sync_pending on lb_bookings (start_at) where calendar_sync_error is not null;
