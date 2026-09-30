-- レッスン予約サービス 初期スキーマ
-- 時刻は timestamptz(UTC)で保持。表示時に主催者のタイムゾーンへ変換する。

create extension if not exists pgcrypto;

create table if not exists lb_hosts (
  id uuid primary key default gen_random_uuid(),
  email text not null unique,
  display_name text not null,
  timezone text not null default 'Asia/Tokyo',
  lesson_minutes integer not null default 60 check (lesson_minutes > 0),
  min_lead_minutes integer not null default 60 check (min_lead_minutes >= 0),
  created_at timestamptz not null default now()
);

-- Google OAuth refresh token は hosts と分離して保持(service role のみアクセス)
create table if not exists lb_host_google_credentials (
  host_id uuid primary key references lb_hosts(id) on delete cascade,
  refresh_token text not null,
  updated_at timestamptz not null default now()
);

create table if not exists lb_host_calendars (
  id uuid primary key default gen_random_uuid(),
  host_id uuid not null references lb_hosts(id) on delete cascade,
  calendar_id text not null,
  label text not null default '',
  role text not null check (role in ('busy_source', 'write_target')),
  unique (host_id, calendar_id)
);
-- write_target は主催者ごとに1件
create unique index if not exists lb_host_calendars_one_write_target
  on lb_host_calendars(host_id) where role = 'write_target';

create table if not exists lb_availability_windows (
  id uuid primary key default gen_random_uuid(),
  host_id uuid not null references lb_hosts(id) on delete cascade,
  weekday smallint not null check (weekday between 0 and 6),
  start_time text not null,  -- 'HH:MM' 主催者ローカル時刻
  end_time text not null,    -- 'HH:MM' 排他的終端
  check (start_time < end_time)
);

create table if not exists lb_students (
  id uuid primary key default gen_random_uuid(),
  email text not null unique,
  name text not null default '',
  created_at timestamptz not null default now()
);

create table if not exists lb_bookings (
  id uuid primary key default gen_random_uuid(),
  host_id uuid not null references lb_hosts(id) on delete cascade,
  student_id uuid not null references lb_students(id) on delete cascade,
  start_at timestamptz not null,
  end_at timestamptz not null,
  status text not null check (status in ('confirmed', 'cancelled')),
  calendar_event_id text,
  note text,
  cancellation_fee_status text not null default 'none'
    check (cancellation_fee_status in ('none', 'pending', 'paid')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (end_at > start_at)
);
create index if not exists lb_bookings_host_start on lb_bookings(host_id, start_at);
create index if not exists lb_bookings_student on lb_bookings(student_id);
-- 同一主催者・同一開始時刻の確定予約は1件(二重予約防止)
create unique index if not exists lb_bookings_unique_confirmed_slot
  on lb_bookings(host_id, start_at) where status = 'confirmed';

create table if not exists lb_change_requests (
  id uuid primary key default gen_random_uuid(),
  booking_id uuid not null references lb_bookings(id) on delete cascade,
  host_id uuid not null references lb_hosts(id) on delete cascade,
  student_id uuid not null references lb_students(id) on delete cascade,
  kind text not null check (kind in ('cancel', 'reschedule')),
  option text not null check (option in ('request_approval', 'reschedule_within_two_weeks', 'pay_cancellation_fee')),
  message text not null check (length(trim(message)) > 0),
  proposed_start_at timestamptz,
  status text not null default 'pending' check (status in ('pending', 'approved', 'rejected')),
  decision_note text,
  created_at timestamptz not null default now(),
  decided_at timestamptz
);
create index if not exists lb_change_requests_host_status on lb_change_requests(host_id, status);
-- 1予約につき pending は1件まで
create unique index if not exists lb_change_requests_one_pending
  on lb_change_requests(booking_id) where status = 'pending';

-- RLS: API サーバーは service role で接続し認可はアプリ層で行うため、anon/authenticated からの直接アクセスは全面拒否
alter table lb_hosts enable row level security;
alter table lb_host_google_credentials enable row level security;
alter table lb_host_calendars enable row level security;
alter table lb_availability_windows enable row level security;
alter table lb_students enable row level security;
alter table lb_bookings enable row level security;
alter table lb_change_requests enable row level security;
