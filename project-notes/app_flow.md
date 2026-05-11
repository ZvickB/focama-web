# Focamai App Flow

## Purpose
- Canonical note for what the app does now.
- Keep this file about implemented behavior, not superseded experiments.

## Current app structure
- The site uses React Router with a shared shell.
- Current public pages are Home, About, Contact, Privacy, and Affiliate Disclosure.
- The homepage is the main product experience and uses the `open` layout.
- Public routes now set page-level SEO metadata in the client: title, description, canonical URL, Open Graph, Twitter tags, and `noindex` on the 404 page.
- Static crawl assets now include `robots.txt`, `sitemap.xml`, and `site.webmanifest`.

## Homepage flow
- First load shows an HTML boot splash from `index.html`.
- While that splash is up, the route loads a lightweight `HomeShell` first; the guided homepage experience is lazy-loaded only after the user starts a search.
- The active homepage ships in the plain white visual mode; the earlier background toggle is no longer exposed in the production UI.
- The user starts with a product query in a compact 2-line homepage textarea.
- After submit:
  - guided discovery starts
  - the follow-up question starts in parallel
  - result skeletons appear below
  - the page scrolls toward the refine/results region
- `Show products now` reveals the preview set.
- `Show focused picks` runs guided finalize and narrows to the final 6.
- `Start a new search` clears the guided state and returns to a fresh search box.
- After final results appear, the user can open the retry panel and ask for a better search direction.
- A tester-facing `Feedback` FAB appears after search starts, or after a short delay on the homepage, and opens a lightweight feedback sheet.

## Guided backend flow
- `GET /api/search/rainforest-discover`
  - primary homepage discovery route
  - currently uses the Oxylabs-backed Amazon path under the Rainforest-named route
  - writes guided discovery cache plus a `discoveryToken`
  - marketplace items without a known positive price are treated as invalid and are removed before preview results or AI candidate-pool caching
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
  - only streams enrichment for the exact `discoveryToken` that owns the active search session
  - pushes ready enrichment when the background work finishes
- `GET /api/search/enrichment`
  - polling fallback for enrichment
  - only returns enrichment for the exact `discoveryToken` that owns the active search session
- `POST /api/search/retry-advice`
  - reads the rejected shortlist plus user feedback
  - returns `recommendation`, `suggestedQuery`, and `rationale`
- `POST /api/feedback`
  - stores lightweight tester feedback
  - accepts quick structured answers, optional free text, optional email, and current journey context
- `GET /api/search/debug`, `GET /api/search/cache`, and `/api/search/live`
  - debugging/support routes, not the main product flow
- Render CORS accepts both live custom frontend origins (`focamai.com` and `www.focamai.com`) and still tolerates the older `focama.vercel.app` origin.

## Amazon store behavior
- The store picker defaults to `Auto`.
- `api/geo.js` returns a country code from Vercel headers.
- The marketplace context now persists the user's marketplace choice in localStorage under `focamai_marketplace`.
- The one-time marketplace prompt state is tracked separately in localStorage under `focamai_marketplace_asked`.
- If a saved marketplace preference exists, the frontend skips geo detection on load and uses that saved value immediately.
- If there is no saved preference, the frontend resolves the geo country code to an explicit Amazon domain, sends it on guided requests when `Auto` is selected, and saves confident detections for future loads.
- After the first search starts, the homepage shows a lightweight one-time inline marketplace prompt inside the search card until the user chooses a store or dismisses it.
- If the marketplace changes during an active search, the frontend restarts discovery/refine for the same submitted query and ignores stale in-flight responses from the older marketplace request.
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
- When retry advice returns a suggested query, the homepage loads it into the main search input, scrolls back to the top search form, hides the previous follow-up textarea, and lets the user either try that new search or jump back down to the existing results without resetting state yet.
- The same-pool retry path is not part of the active homepage UI right now.

## Data, cache, and observability
- Guided discovery is the reusable persistent cache layer.
- Finalize remains request-specific and rebuilds from discovery cache.
- Cached preview results and cached candidate pools are sanitized on read so stale marketplace entries without a known positive price do not reappear or reach finalize AI selection.
- Partial valid haiku output is recoverable, not final: zero picks still use rules fallback, full valid picks stay `haiku_lock`, and partial valid picks are returned as `haiku_lock_topped_up`.
- Search cache and operational history use Supabase when configured, with local fallback in development.
- Product details have a separate per-ASIN cache shared across detail providers.
- Async mini enrichment is token-scoped when it writes back into guided discovery cache so older same-query searches cannot leak context-specific `fit_reason` or `caveat` text into newer sessions.
- Oxylabs product-detail fetches use a fast first pass for finalize enrichment and retry failed ASIN detail calls in the background so cache quality can still improve without holding the modal AI copy back longer.
- When a background detail retry later succeeds, the stored enrichment payload is updated with the new `feature_bullets` and the frontend keeps polling long enough for the open modal to hydrate those bullets in place.
- `search_history` is internal telemetry, not user-facing history.
- Rate limiting is currently a 10-second in-memory rolling window with a limit of 15 requests per IP on the Render process.
- Guided routes expose `Server-Timing`.
- The homepage timing panel appears in development or when `?timing=1` is present.
- The frontend tries SSE enrichment first and falls back to polling if the stream errors.
- Analytics events post to `/api/analytics/track`.
- `GET /api/analytics/dashboard`
  - localhost-only development read endpoint for the `/admin/analytics` page
  - aggregates search runs, events, impressions, clicks, and tester feedback server-side
  - not part of the deployed public product surface
- Tester feedback writes to a dedicated `tester_feedback` table in Supabase when configured, with local file fallback in development.

## Marketplace direction
- Focamai narrows choices before the user goes into a retailer marketplace.
- The normalized product shape should stay vendor-agnostic even if Amazon is the strongest near-term path.
- Rainforest-style Amazon discovery is the main route; SerpApi stays secondary and only matters if deliberately reactivated.
