# DB and Cache Setup

## Current direction
- The primary guided search flow now uses the shared cache/storage layer through `/api/search/discover` and related backend handlers.
- If `SUPABASE_URL` and a server-side Supabase key are configured, cache and operational search-history writes use Supabase.
- If Supabase is not configured or is temporarily unavailable, the app falls back to the existing local JSON cache in `temp-data/`.
- This keeps local development easy while giving us a production-ready persistence path.
- Supabase-backed guided discovery cache is now confirmed working in production on `focama.vercel.app`.
- Future product note: the preferred cache target is raw SerpApi results or cleaned candidate pools, not AI-context-specific final result sets.
- Future product note: detailed user context should usually remain a fresh AI-ranking input rather than the main cache identity.
- Current product choice: guided discovery is the only persistent cache path; `/api/search/live` remains uncached manual/debug execution.

## Environment variables
Add these to the root `.env`:

```env
SERPAPI_API_KEY=your-serpapi-key
OPENAI_API_KEY=your-openai-key
OPENAI_MODEL=gpt-5-mini
SUPABASE_URL=https://your-project-ref.supabase.co
SUPABASE_SECRET_KEY=your-supabase-secret-key
SEARCH_CACHE_TTL_MINUTES=1440
```

Notes:
- `SUPABASE_SECRET_KEY` is the preferred server-side key for this setup.
- If your project only shows the older key type, the backend also accepts `SUPABASE_SERVICE_ROLE_KEY` as a legacy fallback.
- Do not expose either server-side key to the browser.
- `SEARCH_CACHE_TTL_MINUTES` defaults to `1440` if omitted.

## SQL schema
Run this in the Supabase SQL editor:

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

## What gets cached
- Cache keys are now scoped by flow so guided discovery snapshots stay isolated and reusable.
- Guided discovery cache key: `guided_discovery + normalized productQuery`
- Cached payload:
  - guided discovery stores the `candidatePool`, preview `results`, and a `discovery_preview` selection marker
  - `cachedAt`
  - `expiresAt`
- Guided `/api/search/finalize` does not read or write cache; it reranks the submitted candidate pool with the latest priorities/notes.
- `/api/search/live` is intentionally uncached so manual/debug combined runs stay fresh and do not broaden persistent storage scope.
- On cache hit, guided discovery returns the response shape its caller already expects.

## Current tradeoffs
- Cache invalidation is TTL-based only for now.
- Expired Supabase rows are ignored but not actively deleted yet.
- Search history is best-effort operational analytics/persistence and should not block responses.
- The `search_history` table is an internal telemetry table for cache/debug analysis, not the schema for a future user-facing saved-history feature.
- The old `/api/search/cache` debugging route still works, now through the same storage abstraction.
- The removed bare `/api/search` route should stay removed so the guided flow and `/api/search/live` are the only public search entry points.

## Recommended next step
- Keep monitoring cache hit/miss behavior and Supabase table health in production while guided discovery remains the only persistent cache scope.
- If a user-facing saved-history feature is ever added, create a separate product-oriented history table and API instead of reading directly from `search_history`.
