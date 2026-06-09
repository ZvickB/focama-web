# Focamai App Flow

## Purpose
- Canonical note for what the app does now.
- Keep this file about implemented behavior, not superseded experiments.

## Current app structure
- The site uses React Router with a shared shell.
- Current public pages are Home, Search History, Why Focamai, Contact, Privacy, and Affiliate Disclosure.
- The shared header now has an optional auth entry point. When logged out, users see `Sign in`; when logged in, the header shows the account email/initial and a sign-out action.
- The homepage is the main product experience and uses the `open` layout.
- Public routes now set page-level SEO metadata in the client: title, description, canonical URL, Open Graph, Twitter tags, and `noindex` on the 404 page.
- Static crawl assets now include `robots.txt`, `sitemap.xml`, and `site.webmanifest`.

## Homepage flow
- First load shows an HTML boot splash from `index.html`.
- `index.html` now preconnects Google Fonts, preloads the PNG wordmark, and keeps that hero image at high fetch priority for the initial homepage view.
- While the route is idle on first load, it renders a lightweight `HomeShell`, preconnects the configured backend origin, and warms the guided homepage experience chunk in the background; the guided experience still only becomes active after the user starts a search.
- The active homepage ships in the plain white visual mode; the earlier background toggle is no longer exposed in the production UI.
- The user starts with a product query in a compact 2-line homepage textarea.
- After submit:
  - guided discovery starts
  - the follow-up question starts in parallel
  - the large search stage collapses into a compact progress line and search summary
  - the refine step becomes the active panel
  - the refine panel shows a clear "What should Focamai keep in mind?" heading, the AI follow-up question, and up to 3 refinement chips
  - result skeletons appear below when needed
  - the page scrolls toward the active refine/results region
- Refinement chips use backend suggestions when available and fall back to `Good value`, `Easy to use`, and `Fits my space`; label-only chips append to the notes box, prompt-backed chips fill the notes box with richer text, and selected chips get a subtle selected state.
- `Show products now` reveals the preview set. Preview rows stay factual and do not show fallback recommendation copy when no user-facing detail exists.
- `Show focused picks` runs guided finalize and narrows to the final 6; during that wait, the results area shows staged progress copy for reading the search, applying notes, narrowing to six picks, and getting the shortlist ready. When follow-up notes add hard eligibility constraints such as kosher/Jewish-use, dietary/allergy, safety/material, or compatibility/exclusion needs, the frontend first does one refreshed Rainforest discovery pass with the original query plus notes, then finalizes from that refreshed token.
- After final picks appear, the refinement panel collapses into a compact summary above the ranked results.
- After final picks appear, the completed search is saved to device-local history in localStorage. History entries dedupe by normalized query plus follow-up notes, so rerunning the same search refreshes the saved entry instead of adding a duplicate.
- `/history` shows completed searches saved on the current device, newest first. Each entry can expand to show the saved six picks, be deleted, clear all history, or re-run the saved query with follow-up notes prefilled.
- Auth UI is present and does not gate search. Email/password and Google sign-in are wired through the Supabase browser client when `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` are configured; otherwise the modal shows setup copy.
- When signed out, user-facing search history uses localStorage. When signed in, the active history store switches to Supabase `saved_searches`; local entries are migrated into the account on login and then cleared locally after successful migration.
- `Start a new search` clears the guided state and returns to a fresh search box.
- After final results appear, the user can open the retry panel and ask for a better search direction.
- As soon as `HomeExperience` mounts, it prefetches the lazy `ResultsSection` and `ProductDetailModal` chunks so those UI steps are more likely to be ready before the user needs them.
- Route-level lazy loading shows a visible loading fallback, and chunk-load crashes get a reload-focused recovery message in the top-level error boundary.
- A tester-facing `Feedback` FAB appears after search starts, or after a short delay on the homepage, and opens a lightweight feedback sheet.
- The active web UI uses restrained white/cream surfaces, consistent rounded corners, lighter shadows, and teal-first actions with orange reserved for the shopping clickout CTA.

## Guided backend flow
- `GET /api/search/rainforest-discover`
  - primary homepage discovery route
  - uses Rainforest API first for all Amazon marketplaces when configured
  - falls back to Oxylabs only when Rainforest errors or returns too few usable items to support the 6-item shortlist; if Rainforest is not configured, Oxylabs remains the emergency provider when credentials are available
  - writes reusable guided discovery cache and creates a separate token-scoped session snapshot for finalize/enrichment
  - honors an explicit one-request cache refresh mode for accepted retry-advice searches, bypassing the shared discovery cache read while still writing fresh provider results back to shared cache and session state
  - also honors that refresh mode for the one-time pre-finalize discovery pass when follow-up notes contain hard constraints
  - automatically bypasses cached discovery snapshots that are too thin to support the 6-item shortlist, so a one-result cache entry cannot trap normal searches
  - marketplace items without a known positive price are treated as invalid and are removed before preview results or AI candidate-pool caching
  - after the normal response is sent, starts a timed background query-quality review when OpenAI is configured, stores `selection.queryQuality` on the token-scoped session snapshot, and treats review failures as non-blocking telemetry
  - query-quality review is checked by the frontend through polling; if a high-confidence suggestion is ready, the homepage shows an optional small prompt without replacing the original results
  - there is still no query-quality SSE or suggested-query prewarm path
- `GET /api/search/refine`
  - returns one short follow-up question plus helper copy
  - uses OpenAI mini first for the generated question and refinement chip suggestions
  - falls back to Haiku if OpenAI fails or is not configured
- `POST /api/search/finalize`
  - accepts lightweight context
  - rebuilds the candidate pool server-side from guided cache
  - when the query or user context clearly asks for Prime delivery/eligibility, narrows the candidate pool to provider-confirmed Prime-eligible items when any are available
  - locks the shortlist with haiku first, ranking inferred product fit before quality confidence, price/value, shortlist variety, and raw Amazon search position
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
- `GET /api/search/query-quality`
  - polling endpoint for the background query-quality review
  - returns `ready: false` while the review is pending
  - returns a minimal suggestion payload only when the stored review is high-confidence and user-visible
  - returns `shouldSuggest: false` for quiet no-op reviews, ambiguous language, failures, or skipped reviews
- `GET /api/search/product-details`
  - lightweight one-product detail hydration endpoint used when a user opens a skipped-refinement preview product
  - reads the per-ASIN product details cache first and uses Oxylabs only for cache misses when credentials are configured
  - returns product detail bullets, product description, Prime, and delivery facts; it does not run AI recommendation analysis
- `POST /api/search/retry-advice`
  - reads the rejected shortlist plus user feedback
  - returns `recommendation`, `suggestedQuery`, and `rationale`
- `POST /api/feedback`
  - stores lightweight tester feedback
  - accepts quick structured answers, optional free text, optional email, and current journey context
- `GET /api/search/debug`, `GET /api/search/cache`, and `/api/search/live`
  - debugging/support routes, not the main product flow
- Render CORS accepts both live custom frontend origins (`focamai.com` and `www.focamai.com`) and still tolerates the older `focama.vercel.app` origin.
- The same Render Express process also mounts the KAILA API at `/kaila` for the separate KAILA Vercel app. This keeps Focamai's existing `/api/...` routes live while exposing `GET /kaila/health`, `POST /kaila/ask`, and `POST /kaila/ask/stream`. The KAILA ask routes resolve the public store `embed_key`, retrieve product-scoped passages, and return a grounded answer payload with citations. The stream route emits status-only SSE events (`retrieving`, `answering`, `validating`) before the final `done` payload; it does not stream answer tokens before validation.

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
- Result lists show up to 6 ranked picks.
- Results use a ranked shortlist layout rather than a marketplace grid.
- On desktop, the ranked shortlist uses a large selected-product panel on the left and an internally scrolling row list on the right. Hovering or focusing a row updates the selected panel, and scrolling the internal list updates it to the top visible row.
- On smaller screens, results collapse into stacked ranked pick cards.
- A development-only results-view toggle can switch between the ranked rows view and the older grid/card view.
- Result rows/cards show reliable product facts first: image, title, price, one combined ratings/reviews signal, and at most one delivery signal when available. The provider/source name is carried by the shopping clickout CTA when available, not repeated as separate card metadata.
- Provider-confirmed Prime eligibility is preserved as structured product data and shown as a quiet factual `Prime` marker on result rows/cards plus a modal `Delivery` fact only when Prime is confirmed. Plain free-delivery text can show as `Free delivery` instead of being upgraded to Prime. Positive Rainforest delivery text such as Prime delivery/signup eligibility is promoted into `isPrime`; Focamai does not show negative/unknown Prime copy, use the official Amazon Prime logo, or turn Prime into a marketplace-style filter panel.
- Some Oxylabs search rows underreport Prime even when the product page confirms it. Async product-detail enrichment can upgrade a result to `isPrime: true` and hydrate the row/card plus modal fact after the initial shortlist appears.
- User-facing result and detail titles are normalized for display so long Amazon keyword-stuffed titles are shortened without changing the raw product data. Long titles with commas keep the first comma chunk; otherwise display titles truncate at a word boundary before 80 characters.
- Result, retry, and modal surfaces now share a quieter visual system: fewer decorative gradients, smaller shadows, and more consistent 16-28px radii.
- Selecting a row or the row details action opens the modal.
- The modal is ordered as a decision aid: image and title, an `At a glance` facts card, `Why this pick`, `Worth knowing`, then product notes from `feature_bullets` or description. The facts card stays compact with price, combined ratings/reviews, and optional delivery; source/store naming is reserved for the shopping CTA instead of repeated as passive metadata.
- For skipped-refinement preview products, the modal hides the AI `Why this pick` analysis panel because finalize/enrichment has not run; opening the preview modal lazily hydrates product notes from the per-ASIN cache or Oxylabs.
- If the normalized detail heading differs from the raw title, the detail header exposes the original directly under the title behind a quiet `Full Amazon title`/source-title disclosure.
- If enrichment is still pending, result rows/panels and the modal use quiet teal/orange breathing dots instead of visible uncertainty copy; if enrichment settles without a fit reason, the modal shows a practical fallback instead of an empty section.
- Shopping clickout CTAs happen from result rows/cards and the modal CTA, and derive their visible label from the product source/store (`View on Amazon`, `View on Walmart`, etc.) instead of using generic `retailer` wording when a source name is available.
- The modal bottom bar is the single shopping decision area, showing current price, availability reminder, one source-specific clickout CTA, and one compact Amazon Associates disclosure when an Amazon link is available.

## Retry behavior
- Retry is not an endless-results flow.
- The current retry UX appears as a quiet end-of-shortlist row: `Need a better fit?` with an `Improve picks` action.
- The expanded retry panel asks `What felt off?`, offers three broad quick prompts (`Too expensive`, `Wrong style`, and `Missing a must-have`), and keeps a freeform text area for explicit corrections.
- `/api/search/retry-advice` suggests a more specific next query.
- Retry advice preserves accumulated must-have constraints from the original query, follow-up notes, and retry feedback by default, but can replace or remove a previous constraint when the latest feedback clearly changes direction.
- Quick prompts append into the existing `rejectionFeedback` text sent to `/api/search/retry-advice`; the backend contract is otherwise unchanged.
- When retry advice returns a suggested query, the retry panel shows it immediately as an editable `Next search` field.
- `Search again` starts a new guided search from the retry area with a one-request discovery cache refresh, then scrolls toward the loading/results region.
- The same-pool retry path is not part of the active homepage UI right now.

## Query-quality suggestion behavior
- After discovery returns, the frontend polls `/api/search/query-quality` for the active `discoveryToken`, query, and marketplace.
- The first discovery response and refinement flow remain uninterrupted while the review runs.
- If the stored review says to suggest a better query, the homepage shows a small inline prompt near the refine/results region:
  - `We searched for "[original query]".`
  - `Try "[suggested query]" instead?`
  - `Try suggested search`
  - `Keep these results`
- `Try suggested search` starts a normal new guided search for the suggested query and updates the top search input.
- `Keep these results` hides the prompt and keeps the original discovery token/results active.
- Stale query-quality poll responses are ignored after a new search or marketplace restart.
- There is no automatic query replacement, warmed-token reuse, SSE, or suggested-query prewarm in the current MVP.

## Data, cache, and observability
- Guided discovery is the reusable persistent cache layer.
- Rainforest guided discovery uses a versioned shared cache scope (`rainforest_discovery:v3`) so older provider/search-era candidate pools and pre-Prime-delivery-normalization rows are not reused as current evidence.
- Finalize remains request-specific and rebuilds from discovery cache.
- Amazon discovery and product-detail enrichment preserve provider Prime signals, including Rainforest delivery text with Prime availability, as structured `isPrime` data through candidate pools, finalize/enrichment payloads, and final UI results.
- Cached preview results and cached candidate pools are sanitized on read so stale marketplace entries without a known positive price do not reappear or reach finalize AI selection.
- Thin cached discovery snapshots are treated as refresh candidates instead of reusable evidence when they have fewer than the shortlist count of cached results or candidates.
- Partial valid haiku output is recoverable, not final: zero picks still use rules fallback, full valid picks stay `haiku_lock`, and partial valid picks are returned as `haiku_lock_topped_up`.
- Search cache and operational history use Supabase when configured, with local fallback in development.
- User-facing saved-search history uses localStorage under `focamai:searchHistory:v1` for signed-out users and Supabase `saved_searches` for signed-in users.
- Supabase auth state is handled client-side through `AuthProvider`; the Supabase browser client is lazy-loaded so auth does not inflate the initial search bundle.
- Product details have a separate per-ASIN cache shared across detail providers.
- Async mini enrichment is token-scoped when it writes back into the per-session discovery snapshot so older same-query searches cannot leak context-specific `fit_reason` or `caveat` text into newer sessions.
- Mini enrichment treats the first locked product as the hero recommendation and writes later picks as alternatives that explain who might prefer them over the hero.
- Oxylabs product-detail fetches use a fast first pass for finalize enrichment and retry failed ASIN detail calls in the background so cache quality can still improve without holding the modal AI copy back longer.
- When a background detail retry later succeeds, the stored enrichment payload is updated with the new `feature_bullets` and the frontend keeps polling long enough for the open modal to hydrate those bullets in place.
- Backend observability is now opt-in through Sentry (`SENTRY_DSN`) with sanitized error context, and background async failures are logged/reported instead of disappearing silently.
- `search_history` is internal telemetry, not user-facing history.
- Account-backed saved-search history uses `saved_searches`, not the existing internal `search_history` table.
- Rate limiting is a 10-second rolling window with a limit of 15 requests per client IP. In production it uses a shared Supabase `rate_limit_events` event log keyed by a hashed IP value, and falls back to the process-local memory limiter when Supabase is unavailable.
- Guided routes expose `Server-Timing`.
- Discovery query-quality review is now a background pass plus frontend polling. It can mark the token-scoped snapshot as pending, skipped, ready, or failed under `selection.queryQuality`, while preserving any existing `selection.enrichment`.
- Query-quality suggestion analytics track shown, accepted, and rejected events with bounded metadata such as query lengths, classification, and confidence.
- The homepage timing panel appears in development or when `?timing=1` is present.
- The frontend tries SSE enrichment first and falls back to polling if the stream errors.
- Analytics events post to `/api/analytics/track`.
- `GET /api/analytics/dashboard`
  - localhost-only development read endpoint for the `/admin/analytics` page
  - aggregates search runs, events, impressions, clicks, and tester feedback server-side
  - not part of the deployed public product surface
- Tester feedback writes to a dedicated `tester_feedback` table in Supabase when configured, with local file fallback in development.

## Marketplace direction
- Focamai narrows choices before the user leaves to shop, instead of becoming a marketplace wall inside the app.
- Amazon is the current primary commerce path and affiliate target. When the active source is Amazon, frontend copy, buttons, labels, and detail UI may say Amazon directly where it improves clarity, trust, or conversion.
- Do not force generic labels like `retailer` in user-facing UI when `Amazon` is more accurate for the current experience.
- Do not add new Amazon/source/retailer fields or badges as incidental work. For existing shopping clickout CTAs, the chosen compromise is source-derived wording: Amazon items can say `View on Amazon`/the active Amazon domain, while future non-Amazon sources should use their own source name.
- Keep backend/provider logic, normalized product data, and search flow reasonably provider-flexible so another source can be added or swapped later.
- The normalized product shape should stay provider-flexible, but future multi-retailer flexibility should not make today's Amazon-first UX vague.
- Rainforest-style Amazon discovery is the main route; SerpApi stays secondary and only matters if deliberately reactivated.
