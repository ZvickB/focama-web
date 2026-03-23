# DB and Cache Setup

## Current direction
- The live `/api/search` route now supports a real cache layer.
- If `SUPABASE_URL` and a server-side Supabase key are configured, cache and search-history writes use Supabase.
- If Supabase is not configured or is temporarily unavailable, the app falls back to the existing local JSON cache in `temp-data/`.
- This keeps local development easy while giving us a production-ready persistence path.
- Future product note: the preferred cache target is raw SerpApi results or cleaned candidate pools, not AI-context-specific final result sets.
- Future product note: detailed user context should usually remain a fresh AI-ranking input rather than the main cache identity.

## Environment variables
Add these to the root `.env`:

```env
SERPAPI_API_KEY=your-serpapi-key
OPENAI_API_KEY=your-openai-key
OPENAI_MODEL=gpt-5-mini
SUPABASE_URL=https://your-project-ref.supabase.co
SUPABASE_SECRET_KEY=your-supabase-secret-key
SEARCH_CACHE_TTL_MINUTES=360
```

Notes:
- `SUPABASE_SECRET_KEY` is the preferred server-side key for this setup.
- If your project only shows the older key type, the backend also accepts `SUPABASE_SERVICE_ROLE_KEY` as a legacy fallback.
- Do not expose either server-side key to the browser.
- `SEARCH_CACHE_TTL_MINUTES` defaults to `360` if omitted.

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
- Cache key: normalized `productQuery + details`
- Cached payload:
  - `candidatePool`
  - final `results`
  - `selection`
  - `cachedAt`
  - `expiresAt`
- The live route checks cache before calling SerpApi.
- On cache hit, the API returns the same core response shape the frontend already expects.

## Current tradeoffs
- Cache invalidation is TTL-based only for now.
- Expired Supabase rows are ignored but not actively deleted yet.
- Search history is best-effort analytics/persistence and should not block responses.
- The old `/api/search/cache` debugging route still works, now through the same storage abstraction.
- The current implementation is broader than the preferred future direction because it can cache full search responses; when revisited, narrow this toward SerpApi/raw candidate caching first.

## Recommended next step
- After the Supabase project is created and these tables exist, add the two Supabase env vars to Vercel and local `.env`.
- Once that is stable, the next useful DB task is deciding whether user-facing search history should read from `search_history` directly or use a separate product-oriented history table.
