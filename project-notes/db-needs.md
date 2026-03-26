# Current DB Needs

## Purpose
- This note explains, in simple terms, which database tables the project needs right now and why.
- It is meant to be easier to read than the lower-level setup doc.

## What the app needs right now

These are the only Supabase tables the current app uses today.

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

## What is available later, but not needed yet
- `search_sessions`
- `search_shortlists`
- `shortlist_items`
- User accounts tables
- Saved searches tables
- Saved items tables
- User preferences tables
- Analytics event tables

Why not yet:
- The current product direction uses the database mainly as backend infrastructure.
- The current notes treat `search_history` as operational telemetry, not as user-facing history.
- Adding more tables now would increase complexity before the app actually writes to them.

## Current recommendation
- Keep the database focused on cache plus operational history for now.
- Only add product-memory tables later if the app needs to remember real search flows as product data.

## Related notes
- `project-notes/db-cache-setup.md`
- `project-notes/current-status.md`
- `project-notes/app_flow.md`

## Supabase table names
- `public.search_cache`
- `public.search_history`

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

## What to expect after running it
- `search_cache` will store reusable guided discovery cache rows.
- `search_history` will store internal search/debug log rows.
- Your backend can keep using Supabase for cache/history with the current app structure.

## Simple decision summary
- Create now: `search_cache`, `search_history`
- Do not create yet: `search_sessions`, `search_shortlists`, `shortlist_items`
- Reason: the current app uses the first two tables now, while the others would be future product-schema work
