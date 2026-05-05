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

### `tester_feedback`
- Stores lightweight tester feedback from the homepage FAB.
- Holds quick structured answers, optional written comments, optional follow-up email, and basic session/search context.

## Not used now
- `rate_limit_events`
- user accounts tables
- saved search tables
- saved item tables
- preference-learning tables

Rate limiting is currently in-memory on the Render process, so there is no active Supabase rate-limit table in the current architecture.

## Current recommendation
- Create the eight tables above if you want full Supabase-backed storage and analytics plus tester feedback.
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
```

Notes:
- `SUPABASE_SECRET_KEY` is the preferred server-side key.
- Legacy `SUPABASE_SERVICE_ROLE_KEY` is still accepted.
- Do not expose either server-side key to the browser.

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

## Related notes
- `project-notes/current-status.md`
- `project-notes/app_flow.md`
- `project-notes/analytics-funnel-schema.sql`
