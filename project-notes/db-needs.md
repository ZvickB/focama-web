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
- Shared by the active Rainforest detail helper.

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

### `saved_searches`
- Stores user-facing saved search history for signed-in users.
- Separate from internal `search_history`.
- Uses Supabase auth/RLS with `user_id` ownership.

### `user_preferences`
- Stores signed-in account preferences such as shortlist ranking priority.
- Current ranking enum is `balanced | price | lowest_price | brand | range`.
- Uses Supabase auth/RLS with one row per `user_id`.

### `price_watches`
- Stores signed-in users' Price Watch products for the Phase 1 watchlist UI.
- Watches a specific Amazon ASIN + marketplace, not a saved search.
- Uses Supabase auth/RLS with `user_id` ownership.
- Browser CRUD is active under RLS for `/watches` and finalized modal `Watch price`.
- The daily server-side job reads it with the service key, checks fresh Rainforest numeric prices, updates `last_checked_at` plus positive `last_seen_price`, and logs would-notify decisions while email is disabled. With `PRICE_WATCH_EMAILS_ENABLED=true`, it sends Resend alerts and resets `baseline_price` only after successful send.

### `deep_dive_cache`
- Stores feature-flagged Compare-prices (Deep Dive path) product-group and Immersive cache entries. The synthesis cache layer is unused since review synthesis was removed on 2026-07-08.
- Separate from guided discovery cache and internal `search_history`.

### `deep_dive_usage`
- Stores account-level Deep Dive usage for the current first-free account gate.
- Payment/subscription tables are still deferred.

### `sensitive_image_verdicts`
- Server-owned cache of successful Sightengine `show`/`hide` decisions keyed by
  a SHA-256 image URL hash.
- Stores the normalized URL for debugging plus reasons, signals, thresholds,
  provider metadata, and an application-controlled `decision_version`.
- Provider failures are deliberately not stored as verdicts so temporary
  failures remain retryable while current responses continue to fail closed.
- Uses RLS with no browser policies; backend service credentials are the only
  intended access path.
- The table and application storage wiring are implemented. The separately
  flagged user-facing reveal path remains off by default.

## Not used now
- user accounts tables
- saved item tables
- preference-learning tables
- payment/subscription tables

Rate limiting falls back to in-memory storage when Supabase is not configured or the table is unavailable, but production should create this table before public traffic.

## Current recommendation
- Create the app tables above if you want full Supabase-backed storage, analytics, search diagnostics, tester feedback, shared rate limiting, signed-in history, account preferences, and Deep Dive.
- Keep user-facing memory features separate from `search_history`.

## Environment variables
```env
SERPAPI_API_KEY=your-serpapi-key
OPENAI_API_KEY=your-openai-key
SUPABASE_URL=https://your-project-ref.supabase.co
SUPABASE_SECRET_KEY=your-supabase-secret-key
SEARCH_CACHE_TTL_MINUTES=1440
RATE_LIMIT_STORAGE=auto
RATE_LIMIT_HASH_SALT=your-stable-random-salt
SENSITIVE_IMAGE_SHADOW_ENABLED=true
SENSITIVE_IMAGE_REVEAL_ENABLED=true
RESEND_API_KEY=your-resend-key
PRICE_WATCH_EMAILS_ENABLED=true
PRICE_WATCH_FROM_EMAIL=contact@focamai.com
PRICE_WATCH_MANAGE_URL=https://focamai.com/watches
PRICE_WATCH_INTERNAL_TOKEN=long-random-secret
```

Notes:
- `SUPABASE_SECRET_KEY` is the preferred server-side key.
- Legacy `SUPABASE_SERVICE_ROLE_KEY` is still accepted.
- Do not expose either server-side key to the browser.
- `RATE_LIMIT_STORAGE=auto` uses Supabase when configured and memory otherwise; set `memory` only for local/debug fallback.
- `RATE_LIMIT_HASH_SALT` is optional but recommended so rate-limit keys remain stable without relying on the Supabase secret as the hash salt.
- `SENSITIVE_IMAGE_SHADOW_ENABLED=true` banks successful Sightengine decisions and checks the persistent cache before making a billed provider call.
- `SENSITIVE_IMAGE_REVEAL_ENABLED=true` is approved for the current tester-only production rollout. Set it back to `false` immediately if a dangerous false reveal appears.
- `DEEP_DIVE_ENABLED=true` is required before the Deep Dive endpoint calls SerpApi.
- `DEEP_DIVE_REQUIRE_AUTH=true` keeps Deep Dive account-gated. Keep this on for the first release.
- `DEEP_DIVE_FREE_LIMIT=1` is the default non-subscriber cap; `DEEP_DIVE_FREE_LIMIT_DISABLED=true` temporarily disables that cap in controlled testing.
- `DEEP_DIVE_SUBSCRIBER_EMAILS` and `DEEP_DIVE_SUBSCRIBER_USER_IDS` can grant temporary unlimited tester/subscriber access until billing/account tables exist.
- `DEEP_DIVE_ALLOWED_DOMAINS_US` and `DEEP_DIVE_ALLOWED_DOMAINS_CA` can override the default direct-retailer allowlists.
- `RESEND_API_KEY` powers Price Watch email alerts when `PRICE_WATCH_EMAILS_ENABLED=true`.
- `PRICE_WATCH_FROM_EMAIL` should stay `contact@focamai.com` until `alerts@focamai.com` is verified/usable in Resend.
- `PRICE_WATCH_MANAGE_URL` defaults to `https://focamai.com/watches`.
- `PRICE_WATCH_INTERNAL_TOKEN` protects `POST /api/internal/check-price-watches`; external schedulers must send it as a Bearer token.

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

### Sensitive-image verdict cache
Run the standalone, rerunnable schema in
`project-notes/plans/sightengine-verdict-cache-schema.sql`. Application wiring and
user-facing reveal behavior are separately controlled; creating the table does
not enable reveals.

### Signed-in history table
```sql
create table if not exists public.saved_searches (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  query_key text not null,
  query text not null,
  follow_up text not null default '',
  amazon_domain text,
  results jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  unique (user_id, query_key)
);

create index if not exists saved_searches_user_created_at_idx
  on public.saved_searches (user_id, created_at desc);

create index if not exists saved_searches_user_updated_at_idx
  on public.saved_searches (user_id, updated_at desc);

alter table public.saved_searches enable row level security;

create policy "saved_searches_select_own"
  on public.saved_searches
  for select
  using (auth.uid() = user_id);

create policy "saved_searches_insert_own"
  on public.saved_searches
  for insert
  with check (auth.uid() = user_id);

create policy "saved_searches_update_own"
  on public.saved_searches
  for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create policy "saved_searches_delete_own"
  on public.saved_searches
  for delete
  using (auth.uid() = user_id);
```

### User preferences table
```sql
create table if not exists public.user_preferences (
  user_id uuid primary key references auth.users (id) on delete cascade,
  ranking_priority text not null default 'balanced',
  updated_at timestamptz not null default timezone('utc', now()),
  constraint user_preferences_ranking_priority_check
    check (ranking_priority in ('balanced', 'price', 'lowest_price', 'brand', 'range'))
);

alter table public.user_preferences enable row level security;

create policy "user_preferences_select_own"
  on public.user_preferences
  for select
  using (auth.uid() = user_id);

create policy "user_preferences_insert_own"
  on public.user_preferences
  for insert
  with check (auth.uid() = user_id);

create policy "user_preferences_update_own"
  on public.user_preferences
  for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);
```

### Price watches table
```sql
create table if not exists public.price_watches (
  id                  uuid primary key default gen_random_uuid(),
  user_id             uuid not null references auth.users(id) on delete cascade,
  asin                text not null,
  amazon_domain       text not null default 'amazon.com',
  product_title       text not null default '',
  image_url           text not null default '',
  product_url         text not null default '',
  baseline_price      numeric not null,
  threshold_pct       numeric not null default 5,
  target_price        numeric,
  last_seen_price     numeric,
  last_checked_at     timestamptz,
  last_notified_price numeric,
  last_notified_at    timestamptz,
  paused              boolean not null default false,
  created_at          timestamptz not null default timezone('utc', now()),
  updated_at          timestamptz not null default timezone('utc', now())
);

alter table public.price_watches
  add constraint price_watches_baseline_positive check (baseline_price > 0),
  add constraint price_watches_threshold_range check (threshold_pct > 0 and threshold_pct <= 100),
  add constraint price_watches_target_positive check (target_price is null or target_price > 0);

create unique index if not exists price_watches_user_asin_domain_idx
  on public.price_watches (user_id, asin, amazon_domain);

create index if not exists price_watches_active_idx
  on public.price_watches (paused, asin, amazon_domain);

alter table public.price_watches enable row level security;

create policy "price_watches_select_own"
  on public.price_watches
  for select
  using (auth.uid() = user_id);

create policy "price_watches_insert_own"
  on public.price_watches
  for insert
  with check (auth.uid() = user_id);

create policy "price_watches_update_own"
  on public.price_watches
  for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create policy "price_watches_delete_own"
  on public.price_watches
  for delete
  using (auth.uid() = user_id);
```

### Deep Dive tables
```sql
create table if not exists public.deep_dive_cache (
  cache_key text primary key,
  layer text not null,
  payload jsonb not null default '{}'::jsonb,
  cached_at timestamptz not null default timezone('utc', now()),
  expires_at timestamptz not null
);

create index if not exists deep_dive_cache_layer_idx
  on public.deep_dive_cache (layer);

create index if not exists deep_dive_cache_expires_at_idx
  on public.deep_dive_cache (expires_at);

create table if not exists public.deep_dive_usage (
  user_id uuid primary key references auth.users (id) on delete cascade,
  used_count integer not null default 0,
  first_used_at timestamptz,
  last_used_at timestamptz,
  updated_at timestamptz not null default timezone('utc', now())
);

create index if not exists deep_dive_usage_last_used_at_idx
  on public.deep_dive_usage (last_used_at desc);
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
  request_id uuid not null,
  rate_key text not null,
  created_at timestamptz not null default timezone('utc', now())
);

alter table public.rate_limit_events
  add column if not exists request_id uuid;

update public.rate_limit_events
set request_id = gen_random_uuid()
where request_id is null;

alter table public.rate_limit_events
  alter column request_id set not null;

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
