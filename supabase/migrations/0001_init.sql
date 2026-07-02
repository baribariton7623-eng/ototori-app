-- 音取りアプリ: お気に入り・ミュート設定・練習履歴
-- ログインは任意機能のため、これらのテーブルは全てSupabase Authのuser_idに紐付き、
-- 未ログイン・未設定時はアプリ側(src/lib/*)が早期returnして一切参照しない。

create table public.favorites (
  user_id uuid references auth.users(id) on delete cascade not null,
  work_id text not null,
  created_at timestamptz not null default now(),
  primary key (user_id, work_id)
);
alter table public.favorites enable row level security;
create policy "own favorites select" on public.favorites for select using (auth.uid() = user_id);
create policy "own favorites insert" on public.favorites for insert with check (auth.uid() = user_id);
create policy "own favorites delete" on public.favorites for delete using (auth.uid() = user_id);

create table public.part_mute_settings (
  user_id uuid references auth.users(id) on delete cascade not null,
  work_id text not null,
  movement_id text not null,
  -- { [partId]: { muted: boolean, volume: number(0-100) } }
  settings jsonb not null,
  updated_at timestamptz not null default now(),
  primary key (user_id, work_id, movement_id)
);
alter table public.part_mute_settings enable row level security;
create policy "own mute settings" on public.part_mute_settings
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- 履歴は無制限増加を避けるため work+movement ごとに1行、play_countを加算するupsert方式
create table public.practice_history (
  user_id uuid references auth.users(id) on delete cascade not null,
  work_id text not null,
  movement_id text not null,
  play_count integer not null default 1,
  first_played_at timestamptz not null default now(),
  last_played_at timestamptz not null default now(),
  primary key (user_id, work_id, movement_id)
);
alter table public.practice_history enable row level security;
create policy "own history select" on public.practice_history for select using (auth.uid() = user_id);
create policy "own history insert" on public.practice_history for insert with check (auth.uid() = user_id);
create policy "own history update" on public.practice_history for update using (auth.uid() = user_id);
