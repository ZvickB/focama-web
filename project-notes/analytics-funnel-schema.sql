create extension if not exists pgcrypto;

create table if not exists public.analytics_search_runs (
  search_id uuid primary key default gen_random_uuid(),
  session_id text not null,
  product_query text not null,
  details text not null default '',
  entered_ai_refinement boolean not null default false,
  used_show_products_now boolean not null default false,
  completed_finalize boolean not null default false,
  retry_round integer not null default 0,
  best_result_key text,
  created_at timestamptz not null default timezone('utc', now())
);

create index if not exists analytics_search_runs_session_id_created_at_idx
  on public.analytics_search_runs (session_id, created_at desc);

create index if not exists analytics_search_runs_created_at_idx
  on public.analytics_search_runs (created_at desc);

create table if not exists public.analytics_search_events (
  id bigint generated always as identity primary key,
  search_id uuid not null references public.analytics_search_runs (search_id) on delete cascade,
  session_id text not null,
  event_type text not null,
  event_data jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default timezone('utc', now())
);

create index if not exists analytics_search_events_search_id_created_at_idx
  on public.analytics_search_events (search_id, created_at asc);

create index if not exists analytics_search_events_event_type_created_at_idx
  on public.analytics_search_events (event_type, created_at desc);

create table if not exists public.analytics_result_impressions (
  id bigint generated always as identity primary key,
  search_id uuid not null references public.analytics_search_runs (search_id) on delete cascade,
  session_id text not null,
  result_set text not null default 'final',
  result_key text not null,
  position integer not null,
  provider text,
  badge_type text,
  is_best_pick boolean not null default false,
  created_at timestamptz not null default timezone('utc', now())
);

create index if not exists analytics_result_impressions_search_id_position_idx
  on public.analytics_result_impressions (search_id, position asc);

create index if not exists analytics_result_impressions_result_key_created_at_idx
  on public.analytics_result_impressions (result_key, created_at desc);

create table if not exists public.analytics_result_clicks (
  id bigint generated always as identity primary key,
  search_id uuid not null references public.analytics_search_runs (search_id) on delete cascade,
  session_id text not null,
  result_set text not null default 'final',
  result_key text not null,
  position integer not null,
  provider text,
  badge_type text,
  is_best_pick boolean not null default false,
  click_target text not null,
  retailer_url text,
  created_at timestamptz not null default timezone('utc', now())
);

create index if not exists analytics_result_clicks_search_id_created_at_idx
  on public.analytics_result_clicks (search_id, created_at desc);

create index if not exists analytics_result_clicks_result_key_created_at_idx
  on public.analytics_result_clicks (result_key, created_at desc);
