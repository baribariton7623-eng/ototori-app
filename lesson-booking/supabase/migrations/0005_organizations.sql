-- 教室(組織)プラン: 複数講師をまとめて契約・紹介する

create table if not exists lb_organizations (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  slug text not null unique check (slug ~ '^[a-z0-9-]{3,32}$'),
  bio text not null default '',
  owner_host_id uuid not null references lb_hosts(id) on delete cascade,
  subscription_status text not null default 'none'
    check (subscription_status in ('none', 'active', 'past_due', 'canceled')),
  stripe_customer_id text unique,
  stripe_subscription_id text,
  created_at timestamptz not null default now()
);

alter table lb_hosts
  add column if not exists organization_id uuid references lb_organizations(id) on delete set null,
  add column if not exists org_plan_active boolean not null default false;
create index if not exists lb_hosts_organization on lb_hosts(organization_id);

create table if not exists lb_org_invitations (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references lb_organizations(id) on delete cascade,
  email text not null,
  status text not null default 'pending' check (status in ('pending', 'accepted', 'declined', 'revoked')),
  invited_by_host_id uuid references lb_hosts(id) on delete set null,
  created_at timestamptz not null default now(),
  responded_at timestamptz
);
create index if not exists lb_org_invitations_email on lb_org_invitations(lower(email)) where status = 'pending';
-- 同じ教室・同じメールへの未回答の招待は 1 件
create unique index if not exists lb_org_invitations_one_pending
  on lb_org_invitations(organization_id, lower(email)) where status = 'pending';

alter table lb_organizations enable row level security;
alter table lb_org_invitations enable row level security;
