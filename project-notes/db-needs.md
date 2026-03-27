# Current DB Needs

## Purpose
- This note explains, in simple terms, which database tables the project needs right now and why.
- It is meant to be easier to read than the lower-level setup doc.

## What the app needs right now

These are the Supabase tables the current app uses today when Supabase-backed storage and shared rate limiting are enabled.

### 1. `search_cache`
Why this table is needed:
- It stores the guided discovery candidate pool on the server.
- It lets `/api/search/finalize` and retry flows reuse that candidate pool.
- It avoids repeating expensive search/discovery work when the same search is reused.
- It keeps finalize/retry requests lighter because the browser can send a `discoveryToken` instead of the full rich candidate pool.

Plain-language summary:
- `search_cache` helps the app stay fast, cheaper to run, and better structured on the backend.

### 2. `search_history`
Why this table is needed:
- It records internal search/debug information such as cache hits or misses.
- It helps inspect candidate counts, result counts, and request behavior.
- It gives operational visibility into how the backend is performing.

Plain-language summary:
- `search_history` is an internal log table for debugging and monitoring, not a user-facing feature.

### 3. `rate_limit_events`
Why this table is needed:
- It lets rate limiting work across multiple server instances instead of only inside one local process.
- It gives the Vercel deployment a shared backend place to count recent requests by client key.
- It keeps local in-memory limiting as a fallback instead of pretending that fallback is production-grade protection.

Plain-language summary:
- `rate_limit_events` is infrastructure for shared abuse protection, not product data.

## What is available later, but not needed yet
- `search_sessions`
- `search_shortlists`
- `shortlist_items`
- User accounts tables
- Saved searches tables
- Saved items tables
- User preferences tables
- Broad analytics warehouse tables

Why not yet:
- The current product direction uses the database mainly as backend infrastructure.
- The current notes treat `search_history` as operational telemetry, not as user-facing history.
- Adding more tables now would increase complexity before the app actually writes to them.

## Optional next schema if you want funnel analytics now

If the next goal is learning whether users choose the AI path, hit `Show products now`, respond to `best` badges, and actually click through to retailer sites, the next useful tables are:

### 1. `analytics_search_runs`
Why this table is useful:
- It gives each search flow a stable `search_id`.
- It lets you mark whether the user entered the AI refinement step.
- It lets you record whether the user chose `Show products now`.
- It lets you tie the final shown shortlist and later clicks back to one search run.

### 2. `analytics_search_events`
Why this table is useful:
- It records the flow steps without forcing every possible event into fixed columns.
- It can capture things like `search_started`, `refine_viewed`, `show_products_now_clicked`, `ai_followup_submitted`, and `final_results_shown`.
- It helps identify where users drop off in the funnel.

### 3. `analytics_result_impressions`
Why this table is useful:
- It records which products were actually shown in a shortlist.
- It can distinguish preview results from finalized results.
- It stores rank position, provider, and badge information such as `best`.
- It lets you measure whether position and badges affect later clicks.

### 4. `analytics_result_clicks`
Why this table is useful:
- It records which product the user actually clicked.
- It can distinguish preview clicks from finalized-result clicks.
- It distinguishes between clicking a card/details surface and clicking through to the retailer.
- It lets you measure whether the top-ranked or `best`-badged item is the one users really select.

Plain-language summary:
- These four analytics tables are the smallest useful schema for measuring the current funnel.
- They should live beside `search_history`, not replace it.
- `search_history` should stay operational/debug telemetry.

## Current recommendation
- Keep the database focused on cache plus operational history for now.
- Only add product-memory tables later if the app needs to remember real search flows as product data.
- If you want analytics next, add only the focused funnel tables above instead of a broad analytics schema.

## Related notes
- `project-notes/db-cache-setup.md`
- `project-notes/current-status.md`
- `project-notes/app_flow.md`
- `project-notes/analytics-funnel-schema.sql`

## Supabase table names
- `public.search_cache`
- `public.search_history`
- `public.rate_limit_events`

## SQL to run in Supabase
Paste this into the Supabase SQL editor and run it.
This creates the tables the current app uses now, in one pass:

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

create table if not exists public.rate_limit_events (
  request_id uuid primary key,
  request_key text not null,
  created_at timestamptz not null default timezone('utc', now()),
  expires_at timestamptz not null
);

create index if not exists rate_limit_events_request_key_created_at_idx
  on public.rate_limit_events (request_key, created_at desc);

create index if not exists rate_limit_events_expires_at_idx
  on public.rate_limit_events (expires_at);
```

## What to do in Supabase
1. Open your Supabase project.
2. Go to `SQL Editor`.
3. Create a new query.
4. Paste the SQL above.
5. Run it.

## What these tables are called
- Cache table: `search_cache`
- Internal history table: `search_history`
- Shared rate-limit table: `rate_limit_events`

## What to expect after running it
- `search_cache` will store reusable guided discovery cache rows.
- `search_history` will store internal search/debug log rows.
- `rate_limit_events` will store short-lived shared rate-limit events.
- Your backend can keep using Supabase for cache/history with the current app structure.

## Simple decision summary
- Create now: `search_cache`, `search_history`, `rate_limit_events`
- Do not create yet: `search_sessions`, `search_shortlists`, `shortlist_items`
- Reason: the current app uses the first three tables now, while the others would be future product-schema work

## Optional analytics SQL
If you want to add the focused funnel analytics schema next, use:

- `project-notes/analytics-funnel-schema.sql`

This file creates:
- `analytics_search_runs`
- `analytics_search_events`
- `analytics_result_impressions`
- `analytics_result_clicks`

These are aimed specifically at answering:
- whether users entered the AI refinement path
- whether users chose `Show products now`
- whether ranking and `best` badges influenced behavior
- which product users actually clicked through to on the retailer side
