-- Account-level shortlist ranking preferences.
-- One row per authenticated user; browser access is restricted to the owner.

create table if not exists public.user_preferences (
  user_id uuid primary key references auth.users (id) on delete cascade,
  ranking_priority text not null default 'balanced',
  updated_at timestamptz not null default timezone('utc', now()),
  constraint user_preferences_ranking_priority_check
    check (ranking_priority in ('balanced', 'price', 'lowest_price', 'brand', 'range'))
);

alter table public.user_preferences enable row level security;

drop policy if exists "user_preferences_select_own" on public.user_preferences;
create policy "user_preferences_select_own"
  on public.user_preferences
  for select
  using (auth.uid() = user_id);

drop policy if exists "user_preferences_insert_own" on public.user_preferences;
create policy "user_preferences_insert_own"
  on public.user_preferences
  for insert
  with check (auth.uid() = user_id);

drop policy if exists "user_preferences_update_own" on public.user_preferences;
create policy "user_preferences_update_own"
  on public.user_preferences
  for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);
