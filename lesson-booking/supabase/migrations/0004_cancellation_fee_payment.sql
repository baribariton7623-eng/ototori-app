-- キャンセルフィーのオンライン決済(講師本人の Stripe アカウントで受け取る)
alter table lb_hosts
  add column if not exists cancellation_fee_amount integer check (cancellation_fee_amount is null or cancellation_fee_amount >= 50),
  add column if not exists stripe_connect_account_id text,
  add column if not exists connect_charges_enabled boolean not null default false;
create unique index if not exists lb_hosts_connect_account_unique
  on lb_hosts(stripe_connect_account_id) where stripe_connect_account_id is not null;

alter table lb_bookings
  add column if not exists cancellation_fee_amount integer;
