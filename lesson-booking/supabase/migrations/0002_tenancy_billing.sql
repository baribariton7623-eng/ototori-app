-- 複数主催者(テナント)向け: 公開ページ用 slug・紹介文・プラン・Stripe 連携

alter table lb_hosts
  add column if not exists slug text,
  add column if not exists bio text not null default '',
  add column if not exists plan text not null default 'free' check (plan in ('free', 'pro')),
  add column if not exists subscription_status text not null default 'none'
    check (subscription_status in ('none', 'active', 'past_due', 'canceled')),
  add column if not exists stripe_customer_id text,
  add column if not exists stripe_subscription_id text;

-- 既存行にはランダムな slug を割り当てる
update lb_hosts set slug = substr(replace(gen_random_uuid()::text, '-', ''), 1, 10) where slug is null;
alter table lb_hosts alter column slug set not null;
alter table lb_hosts add constraint lb_hosts_slug_format check (slug ~ '^[a-z0-9-]{3,32}$');
create unique index if not exists lb_hosts_slug_unique on lb_hosts(slug);
create unique index if not exists lb_hosts_stripe_customer_unique on lb_hosts(stripe_customer_id) where stripe_customer_id is not null;
