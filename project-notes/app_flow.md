# Focamai App Flow

## Purpose
- Canonical note for what the app does now.
- Keep this file about implemented behavior, not superseded experiments.

## Current app structure
- The site uses React Router with a shared shell.
- Current public pages are Home, About, Contact, Privacy, and Affiliate Disclosure.
- The homepage is the main product experience and uses the `open` layout.

## Homepage flow
- First load shows an HTML boot splash from `index.html`.
- The user starts with a product query in the homepage input.
- After submit:
  - guided discovery starts
  - the follow-up question starts in parallel
  - result skeletons appear below
  - the page scrolls toward the refine/results region
- `Show products now` reveals the preview set.
- `Show focused picks` runs guided finalize and narrows to the final 6.
- `Start a new search` clears the guided state and returns to a fresh search box.
- After final results appear, the user can open the retry panel and ask for a better search direction.

## Guided backend flow
- `GET /api/search/rainforest-discover`
  - primary homepage discovery route
  - currently uses the Oxylabs-backed Amazon path under the Rainforest-named route
  - writes guided discovery cache plus a `discoveryToken`
- `GET /api/search/refine`
  - returns one short follow-up question plus helper copy
- `POST /api/search/finalize`
  - accepts lightweight context
  - rebuilds the candidate pool server-side from guided cache
  - locks the shortlist with haiku first
  - if haiku returns a partial valid subset, tops up from deterministic fallback so the response still returns up to 6 eligible products
  - returns shortlist cards immediately
  - starts async product-detail fetch + mini enrichment in the background
- `GET /api/search/enrichment-stream`
  - first enrichment path used by the frontend
  - responds cross-origin for the Vercel -> Render setup
  - pushes ready enrichment when the background work finishes
- `GET /api/search/enrichment`
  - polling fallback for enrichment
- `POST /api/search/retry-advice`
  - reads the rejected shortlist plus user feedback
  - returns `recommendation`, `suggestedQuery`, and `rationale`
- `GET /api/search/debug`, `GET /api/search/cache`, and `/api/search/live`
  - debugging/support routes, not the main product flow

## Amazon store behavior
- The store picker defaults to `Auto`.
- `api/geo.js` returns a country code from Vercel headers.
- The frontend resolves that country code to an explicit Amazon domain and sends it on guided requests when `Auto` is selected.
- Manual store overrides still win over the auto-resolved domain.

## Final result behavior
- Result lists show up to 6 cards.
- Cards stay metadata-first: image, title, provider/source, price, rating, review count, and a deterministic badge.
- Clicking a result opens a modal.
- The modal shows `feature_bullets` immediately when available.
- The modal later hydrates `fit_reason` and `caveat` from enrichment.
- Retailer clicks happen from the modal CTA.

## Retry behavior
- Retry is not an endless-results flow.
- The current retry UX asks what felt wrong about the picks.
- `/api/search/retry-advice` suggests a more specific next query.
- Clicking the suggestion resets the app to a fresh search with that query prefilled and editable.
- The same-pool retry path is not part of the active homepage UI right now.

## Data, cache, and observability
- Guided discovery is the reusable persistent cache layer.
- Finalize remains request-specific and rebuilds from discovery cache.
- Partial valid haiku output is recoverable, not final: zero picks still use rules fallback, full valid picks stay `haiku_lock`, and partial valid picks are returned as `haiku_lock_topped_up`.
- Search cache and operational history use Supabase when configured, with local fallback in development.
- Product details have a separate per-ASIN cache shared across detail providers.
- `search_history` is internal telemetry, not user-facing history.
- Rate limiting is currently a 10-second in-memory rolling window with a limit of 15 requests per IP on the Render process.
- Guided routes expose `Server-Timing`.
- The homepage timing panel appears in development or when `?timing=1` is present.
- The frontend tries SSE enrichment first and falls back to polling if the stream errors.
- Analytics events post to `/api/analytics/track`.

## Marketplace direction
- Focamai narrows choices before the user goes into a retailer marketplace.
- The normalized product shape should stay vendor-agnostic even if Amazon is the strongest near-term path.
- Rainforest-style Amazon discovery is the main route; SerpApi stays secondary and only matters if deliberately reactivated.
