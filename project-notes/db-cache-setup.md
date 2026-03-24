# DB and Cache Setup

## Current direction
- The primary guided search flow now uses the shared cache/storage layer through `/api/search/discover` and related backend handlers.
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
- Cache keys are now scoped by flow so guided discovery snapshots and legacy live-search results do not overwrite each other.
- Guided discovery cache key: `guided_discovery + normalized productQuery`
- Legacy live-search cache key: `live_search + normalized productQuery + details`
- Cached payload:
  - guided discovery stores the `candidatePool`, preview `results`, and a `discovery_preview` selection marker
  - legacy live search stores its own `candidatePool`, final `results`, and `selection`
  - `cachedAt`
  - `expiresAt`
- Guided `/api/search/finalize` does not read or write cache; it reranks the submitted candidate pool with the latest priorities/notes.
- The legacy live route checks only its own cache scope before calling SerpApi/OpenAI.
- On cache hit, each route returns the response shape its caller already expects.

## Current tradeoffs
- Cache invalidation is TTL-based only for now.
- Expired Supabase rows are ignored but not actively deleted yet.
- Search history is best-effort analytics/persistence and should not block responses.
- The old `/api/search/cache` debugging route still works, now through the same storage abstraction.
- The legacy combined `/api/search` route is still available for manual/debug use, but it is not the primary product path.
- The current implementation is still broader than the preferred future direction because the legacy live route can cache full search responses; if revisited again, narrow that path toward SerpApi/raw candidate caching first.

## Recommended next step
- After the Supabase project is created and these tables exist, add the two Supabase env vars to Vercel and local `.env`.
- Once that is stable, the next useful DB task is deciding whether user-facing search history should read from `search_history` directly or use a separate product-oriented history table.
