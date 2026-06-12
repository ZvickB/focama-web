# Current DB Needs

## Purpose
- Plain-language summary of which Supabase tables the current app actually uses.
- This is the current storage reference, not a future schema wishlist.

## Tables the app uses now

### `search_cache`
- Stores guided discovery snapshots.
- Lets finalize and retry rebuild context from a `discoveryToken` instead of trusting a rich browser-posted pool.

### `search_history`
- Internal operational log for cache/debug visibility.
- Not user-facing saved history.

### `product_details_cache`
- Stores reusable per-ASIN product details for shortlist winners.
- Shared by the current Oxylabs detail helper and the later Rainforest detail helper.

### `analytics_search_runs`
- One anchor row per search flow.

### `analytics_search_events`
- Step-by-step event log for the flow.

### `analytics_result_impressions`
- Records which results were shown and in what order.

### `analytics_result_clicks`
- Records card opens and retailer clickouts.

### `search_attempts`
- One diagnostic row per search support code.
- Tracks final/current status, marketplace, platform, safe error fields, backend health, connectivity result, and tester-reported filter/VPN context.
- Used to diagnose failed searches even when Sentry is silent.

### `search_events`
- Lifecycle event log for each search support code.
- Records frontend, backend, provider, internal-filter, health-check, and connectivity stages.
- Used by `/admin/analytics` to show failed searches and support-code traces.

### `tester_feedback`
- Stores lightweight tester feedback from the homepage FAB.
- Holds quick structured answers, optional written comments, optional follow-up email, and basic session/search context.

### `rate_limit_events`
- Stores short-lived hashed client keys for shared backend rate limiting.
- Lets multiple Render instances count against the same 10-second request window.
- Does not store raw IP addresses.

## Not used now
- user accounts tables
- saved search tables
- saved item tables
- preference-learning tables

Rate limiting falls back to in-memory storage when Supabase is not configured or the table is unavailable, but production should create this table before public traffic.

## Current recommendation
- Create the eleven tables above if you want full Supabase-backed storage, analytics, search diagnostics, tester feedback, and shared rate limiting.
- Keep user-facing memory features separate from `search_history`.

## Environment variables
```env
SERPAPI_API_KEY=your-serpapi-key
OPENAI_API_KEY=your-openai-key
OXYLABS_USERNAME=your-oxylabs-username
OXYLABS_PASSWORD=your-oxylabs-password
SUPABASE_URL=https://your-project-ref.supabase.co
SUPABASE_SECRET_KEY=your-supabase-secret-key
SEARCH_CACHE_TTL_MINUTES=1440
RATE_LIMIT_STORAGE=auto
RATE_LIMIT_HASH_SALT=your-stable-random-salt
```

Notes:
- `SUPABASE_SECRET_KEY` is the preferred server-side key.
- Legacy `SUPABASE_SERVICE_ROLE_KEY` is still accepted.
- Do not expose either server-side key to the browser.
- `RATE_LIMIT_STORAGE=auto` uses Supabase when configured and memory otherwise; set `memory` only for local/debug fallback.
- `RATE_LIMIT_HASH_SALT` is optional but recommended so rate-limit keys remain stable without relying on the Supabase secret as the hash salt.

## SQL to run

### Core app tables
```sql
create table if not exists public.search_cache (
  cache_key text primary key,
  product_query text not null,
  details text not null default '',
  candidate_pool jsonb,
  results jsonb not null default '[]'::jsonb,
  selection jsonb,
  source text not null default 'live_search',
  cached_at timestamptz not null default timezone('utc', now()),
  expires_at timestamptz not null
);

create index if not exists search_cache_expires_at_idx
  on public.search_cache (expires_at);

create table if not exists public.search_history (
  id bigint generated always as identity primary key,
  cache_key text not null,
  product_query text not null,
  details text not null default '',
  source text not null,
  cache_status text not null default 'miss',
  selection_mode text,
  candidate_count integer not null default 0,
  result_count integer not null default 0,
  created_at timestamptz not null default timezone('utc', now())
);

create index if not exists search_history_created_at_idx
  on public.search_history (created_at desc);

create index if not exists search_history_cache_key_idx
  on public.search_history (cache_key);

create table if not exists public.product_details_cache (
  asin text primary key,
  feature_bullets jsonb not null default '[]'::jsonb,
  product_description text not null default '',
  source text not null default '',
  needs_updating boolean not null default false,
  next_update_at timestamptz null,
  cached_at timestamptz not null default now()
);
```

### Analytics tables
- Run `project-notes/analytics-funnel-schema.sql` for:
  - `analytics_search_runs`
  - `analytics_search_events`
  - `analytics_result_impressions`
  - `analytics_result_clicks`

### Search diagnostics tables
```sql
create table if not exists public.search_attempts (
  search_id text primary key,
  session_id text,
  platform text not null default 'web',
  app_version text,
  query_text text,
  amazon_domain text,
  provider text,
  status text,
  final_status text,
  error_type text,
  error_message text,
  reported_filter_type text,
  retry_count integer,
  duration_ms numeric,
  result_count_before_internal_filters integer,
  result_count_after_internal_filters integer,
  backend_reachable boolean,
  connectivity_ok boolean,
  cached_or_fallback_used boolean,
  first_seen_at timestamptz not null default timezone('utc', now()),
  last_event_at timestamptz not null default timezone('utc', now()),
  created_at timestamptz not null default timezone('utc', now())
);

create index if not exists search_attempts_last_event_at_idx
  on public.search_attempts (last_event_at desc);

create index if not exists search_attempts_status_idx
  on public.search_attempts (final_status, status);

create index if not exists search_attempts_filter_type_idx
  on public.search_attempts (reported_filter_type);

create table if not exists public.search_events (
  id bigint generated always as identity primary key,
  search_id text not null references public.search_attempts (search_id) on delete cascade,
  session_id text,
  stage text not null,
  status text,
  platform text not null default 'web',
  app_version text,
  query_text text,
  amazon_domain text,
  provider text,
  duration_ms numeric,
  provider_status_code integer,
  result_count_before_internal_filters integer,
  result_count_after_internal_filters integer,
  final_status text,
  error_type text,
  error_message text,
  reported_filter_type text,
  retry_count integer,
  backend_reachable boolean,
  connectivity_ok boolean,
  cached_or_fallback_used boolean,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default timezone('utc', now())
);

create index if not exists search_events_search_id_created_at_idx
  on public.search_events (search_id, created_at asc);

create index if not exists search_events_stage_created_at_idx
  on public.search_events (stage, created_at desc);

create index if not exists search_events_status_created_at_idx
  on public.search_events (final_status, status, created_at desc);
```

### Tester feedback table
```sql
create table if not exists public.tester_feedback (
  id bigint generated always as identity primary key,
  created_at timestamptz not null default timezone('utc', now()),
  session_id text,
  search_id text,
  page text not null default '/',
  stage_reached text not null default 'home',
  was_simple text,
  found_what_you_wanted text,
  enjoyed_experience text,
  free_text text,
  email text,
  query_text text,
  results_seen boolean not null default false,
  finalized boolean not null default false,
  selected_product_id text,
  metadata jsonb not null default '{}'::jsonb
);

create index if not exists tester_feedback_created_at_idx
  on public.tester_feedback (created_at desc);
```

### Rate limiting table
```sql
create table if not exists public.rate_limit_events (
  id bigint generated always as identity primary key,
  rate_key text not null,
  created_at timestamptz not null default timezone('utc', now())
);

alter table public.rate_limit_events
  add column if not exists rate_key text;

alter table public.rate_limit_events
  add column if not exists created_at timestamptz not null default timezone('utc', now());

create index if not exists rate_limit_events_key_created_at_idx
  on public.rate_limit_events (rate_key, created_at desc);
```

## Related notes
- `project-notes/current-status.md`
- `project-notes/app_flow.md`
- `project-notes/analytics-funnel-schema.sql`
