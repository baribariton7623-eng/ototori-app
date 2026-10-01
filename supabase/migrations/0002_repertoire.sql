-- レパートリー管理(生徒・講師向け): プロフィール(役割)と登録曲
--
-- 役割(role)は生徒(student)/講師(teacher)の2種。新規ユーザーは全員 student で自動作成され、
-- 講師への昇格は運営者がSupabaseのSQLエディタで手動実行する(README.md 参照)。
-- 生徒は自分の登録曲のみ閲覧・追加・編集・削除でき、講師は全生徒の登録曲とプロフィールを閲覧できる。

-- ---------------------------------------------------------------------------
-- profiles
-- ---------------------------------------------------------------------------
create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  role text not null default 'student' check (role in ('student', 'teacher')),
  display_name text not null default '',
  created_at timestamptz not null default now()
);
alter table public.profiles enable row level security;

-- RLSポリシー内から profiles を参照すると再帰的にRLSが適用されるため、
-- 講師判定は security definer 関数で行う。
create or replace function public.is_teacher()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.profiles where id = auth.uid() and role = 'teacher'
  );
$$;
revoke all on function public.is_teacher() from public;
grant execute on function public.is_teacher() to authenticated;

create policy "own profile select" on public.profiles
  for select using (auth.uid() = id);
create policy "teacher profile select" on public.profiles
  for select using (public.is_teacher());
create policy "own profile update" on public.profiles
  for update using (auth.uid() = id) with check (auth.uid() = id);

-- role は本人が書き換えられないよう列単位で権限を絞る(display_name のみ更新可)。
revoke update on public.profiles from authenticated;
grant update (display_name) on public.profiles to authenticated;

-- 新規ユーザー登録時に profiles を自動作成する。
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, display_name)
  values (
    new.id,
    coalesce(new.raw_user_meta_data ->> 'full_name', new.raw_user_meta_data ->> 'name', new.email, '')
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- このマイグレーション以前に登録済みのユーザー分を補完する。
insert into public.profiles (id, display_name)
select
  id,
  coalesce(raw_user_meta_data ->> 'full_name', raw_user_meta_data ->> 'name', email, '')
from auth.users
on conflict (id) do nothing;

-- ---------------------------------------------------------------------------
-- repertoire_entries
-- ---------------------------------------------------------------------------
create table public.repertoire_entries (
  id uuid primary key default gen_random_uuid(),
  -- profiles を参照することで、講師画面から PostgREST の埋め込み結合
  -- (select '*, profiles(display_name)') で生徒名を取得できる。
  user_id uuid not null references public.profiles(id) on delete cascade,
  composer text not null check (char_length(composer) between 1 and 100),
  title text not null check (char_length(title) between 1 and 200),
  status text not null default 'practicing' check (status in ('practicing', 'finished', 'on_hold')),
  memo text not null default '' check (char_length(memo) <= 2000),
  lesson_date date,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index repertoire_entries_user_id_idx on public.repertoire_entries (user_id, updated_at desc);
alter table public.repertoire_entries enable row level security;

create policy "own entries select" on public.repertoire_entries
  for select using (auth.uid() = user_id);
create policy "teacher entries select" on public.repertoire_entries
  for select using (public.is_teacher());
create policy "own entries insert" on public.repertoire_entries
  for insert with check (auth.uid() = user_id);
create policy "own entries update" on public.repertoire_entries
  for update using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "own entries delete" on public.repertoire_entries
  for delete using (auth.uid() = user_id);

-- updated_at を自動更新する。
create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger repertoire_entries_set_updated_at
  before update on public.repertoire_entries
  for each row execute function public.set_updated_at();
