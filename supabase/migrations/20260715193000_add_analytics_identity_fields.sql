-- Stage 2: distinguish a persistent browser/device from an individual visit,
-- and safely associate analytics with a signed-in account when one exists.

alter table public.analytics_search_runs
  add column if not exists device_id text,
  add column if not exists account_id uuid references auth.users (id) on delete set null,
  add column if not exists platform text not null default 'web';

alter table public.analytics_search_events
  add column if not exists device_id text,
  add column if not exists account_id uuid references auth.users (id) on delete set null,
  add column if not exists platform text not null default 'web';

alter table public.analytics_result_impressions
  add column if not exists device_id text,
  add column if not exists account_id uuid references auth.users (id) on delete set null,
  add column if not exists platform text not null default 'web';

alter table public.analytics_result_clicks
  add column if not exists device_id text,
  add column if not exists account_id uuid references auth.users (id) on delete set null,
  add column if not exists platform text not null default 'web';

create index if not exists analytics_search_runs_device_id_created_at_idx
  on public.analytics_search_runs (device_id, created_at desc);

create index if not exists analytics_search_runs_account_id_created_at_idx
  on public.analytics_search_runs (account_id, created_at desc)
  where account_id is not null;
