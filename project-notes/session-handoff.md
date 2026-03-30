# Session Handoff

## What this file is for
- This is the short handoff summary for starting a fresh Codex chat.
- It is separate from `handoff.md`, which is still useful as the broader MVP/status tracker.
- In a new chat, you can say: "Please read `project-notes/session-handoff.md` first."

## Read order
- `project-notes/current-status.md`
- `project-notes/app_flow.md`
- `project-notes/handoff.md`
- `project-notes/finalize-strategy.md`

## Current homepage direction
- The default homepage at `/` now uses the `open` layout variant.
- Older UI variants were removed after the open layout direction was chosen.
- The current product direction is the spacious, search-first open layout rather than the older split-screen or chip-heavy flows.

## Important files
- Main app routes and loading fallback: `/src/App.jsx`
- Active homepage layout: `/src/components/home/HomeExperience.jsx`
- Shared homepage UI blocks: `/src/components/home/HomeShared.jsx`
- Shared guided-search logic/state: `/src/components/home/useGuidedSearch.js`
- Site header/nav/logo usage: `/src/components/SiteLayout.jsx`
- Default homepage route file: `/src/pages/HomePage.jsx`
- Plain-language DB note for current Supabase tables: `/project-notes/db-needs.md`
- Optional funnel analytics schema for Supabase: `/project-notes/analytics-funnel-schema.sql`

## Current UI state
- `/` is the `open` variant.
- The open layout is intentionally more minimal and mobile-friendly.
- The homepage hero in the open layout now uses the PNG wordmark instead of plain `Focamai` text.
- The app and boot splash now use Instrument Sans as the primary UI font instead of the older serif base.

## Brand assets
- Master logo: `/src/assets/logo_master_version.svg`
- Sharper small header logo: `/src/assets/logo_header_mark.svg`
- PNG wordmark currently preferred by user: `/src/assets/wordmark.PNG`
- Attempted SVG wordmark exists but user did not like it: `/src/assets/wordmark.svg`

## Loading / fallback state
- A true boot splash now starts from `/index.html`, so slow or throttled loads show branding before React finishes loading
- It shows the PNG wordmark plus the line `Focused shopping`
- It fades away only after the app is ready and the splash has been visible for about 1 second total
- The boot splash now includes a static header shell to keep the hero closer to the real homepage position during handoff

## Search/result behavior
- Shortlist count is now 6 end-to-end, not 4
- This was updated in both frontend and backend logic
- The homepage now uses the guided flow:
  - `/api/search/discover` for the candidate pool and preview set
  - `/api/search/refine` for the AI follow-up prompt
  - `/api/search/finalize` for the final shortlist
- This guided flow is the primary backend architecture for the homepage
- `/api/search/live` is the explicit manual/debug combined route
- The archived staged/persisted finalize experiment is not the active path on `main`.
- Future finalize or latency-architecture changes should start from `project-notes/finalize-strategy.md`.
- Guided refine was slimmed after the reset:
  - AI now returns only one short ranking question
  - helper text and the textarea placeholder are static server-side copy
  - refine now uses minimal reasoning effort
- Guided discovery, refine, and finalize now emit structured `[search-flow]` logs for latency, token usage, candidate counts, and ranking ownership.
- Re-measured refine on 2026-03-30 after the slimming step:
  - average latency: about 1.1 s
  - average total tokens: about 172
- The Vercel route wrappers now preserve forwarded request headers so backend IP-based rate limiting still works in production deployments
- Shared rate limiting now prefers a Supabase-backed event table when configured, with in-memory fallback only for local or degraded environments
- Guided `/api/search/finalize` now rejects oversized or malformed payloads before AI selection and caps candidate pool size at 20
- Guided `/api/search/discover` now returns a lightweight `discoveryToken` tied to the cached guided candidate pool
- Guided `/api/search/finalize` now accepts lightweight finalize context and rebuilds the rich candidate pool server-side from guided discovery cache before AI selection
- The browser no longer needs to POST the full rich guided candidate pool back to `/api/search/finalize`
- Guided `/api/search/finalize` body limit is back to 32 KB now that the finalize payload is lightweight again
- Guided discover/refine/finalize now expose backend stage timing through `Server-Timing` headers, and the homepage shows the timing panel in development or when `?timing=1` is present for quick latency checks
- Guided refine/finalize and `/api/search/live` now also include OpenAI token usage metadata in their JSON responses when AI runs, making refine/finalize cost measurable from actual response data
- Guided discovery now responds before the discovery cache write finishes, so first-time searches are no longer blocked by Supabase cache persistence time
- Guided finalize now trims prompt weight by dropping variant tokens and reducing trust metadata to a score-only signal, while keeping reasons and attributes in the AI selection context
- Promo-only shopping snippets such as `20% OFF` / `LOW PRICE` are now ignored as normalized descriptions, and finalize AI summaries now omit empty/generic filler descriptions plus redundant source/price/delivery boilerplate to cut prompt waste
- Guided finalize prompt slimming now also removes top-level search-state/similar-query prompt text, drops backend-only match-signal and duplicate numeric-price fields from each AI candidate summary, flattens trust metadata to a single `trustScore`, and minifies the candidate JSON block before sending it to OpenAI
- The active one-shot finalize prompt has also now taken one more conservative wording trim:
  - removed the standalone `Prioritize:` heading
  - merged diversity and near-duplicate guidance
  - dropped the redundant allowed badge-label line
  - shortened badge strategy wording while keeping the explicit `Best match` requirement
- Guided discovery filtering now also collapses some clearly redundant same-family candidates before finalize:
  - this only applies when the duplicate-family key and variant signature match, and the merchant matches or the prices are effectively the same
  - broader family differences should still remain available to the AI pool
- The compact shard-scoring finalize experiment was measured and then rolled back after it regressed latency and token usage.
- Guided finalize is back on the slimmer one-shot selector as the active implementation path.
- Guided finalize step 1 is now complete on that baseline:
  - finalized blocking results keep one concise fit reason per pick
  - badge reasons were removed from the blocking result contract
  - drawback/caution text moved off the result card grid and is now modal-only
- Guided finalize step 2 is now complete as frontend-only polish on top of that baseline:
  - homepage copy now better explains that the first query should be the product search itself, closer to what a user would type into Google
  - the refine step is now framed more clearly as the place for natural-language narrowing such as budget, size, comfort, style, or use case
  - AI no longer assigns badge labels in the blocking finalize response
  - finalized results now get deterministic frontend badge labels after the shortlist loads, with a slight delayed reveal so results land before badge polish
  - this does not widen finalize into more blocking backend work
- The backend candidate pool now includes provider-agnostic duplicate-family keys, variant tokens, compact attribute tags, and trust signals before finalize so future search-provider changes can reuse the same internal model more easily
- That candidate pool now also drops a narrow slice of clearly redundant same-family same-variant listings before the AI handoff
- Re-measured cached same-query guided finalize on 2026-03-30 after the badge-scope reduction:
  - finalize average latency: about 7.5 s
  - finalize average total tokens: about 2479
  - full guided-search average total tokens: about 2651
  - compared with the prior cached baseline, finalize improved by about 2.5 seconds on average and crossed the under-8-second finalize milestone the user cared about
- A separate fresh-discovery rerun was also captured after the conservative family-collapse pass:
  - treat it as directional only, not as the clean comparison point for the badge win
  - the badge-scope reduction is the strongest confirmed latency improvement from this pass; the family-collapse effect is still not isolated yet
- Guided discovery telemetry now records the scoped discovery cache key in `search_history`, so debug history lines up with the actual cached entry
- A new best-effort analytics endpoint now exists at `/api/analytics/track` for optional funnel instrumentation
- The homepage now tracks guided-search funnel steps, result impressions, card opens, and retailer click-throughs when the optional analytics tables are present in Supabase
- Analytics result events distinguish preview, final, retry, and previous-result sets so `Show products now` behavior can be compared against finalized AI picks
- Backend env fallback loading now caches the parsed `.env` file in-process, so repeated `getEnv()` reads no longer hit sync disk I/O on request paths
- The Vercel route wrappers now share a tiny bridge helper instead of each manually recreating the same Node-like adapter logic
- `/api/search/debug` should be read as guided-primary debug output, with `/api/search/live` treated as the manual combined route
- `/api/health/supabase` now reports local fallback as a supported state when Supabase is not configured
- Supabase-backed guided discovery cache is now confirmed working in production on `focama.vercel.app`
- Guided `/api/search/finalize` and `/api/search/live` remain intentionally uncached
- Open layout behavior:
  - centered hero
  - search input first
  - refinement area expands after submit
  - `Start a new search` resets the homepage back to a clean blank search state
  - final results now include a `Didn't find anything you like? Tell us why.` retry path
  - retrying requires feedback and is capped at 2 follow-up retries
  - retrying excludes the previously rejected shortlist from reselection
  - earlier rejected shortlists collapse into a `Previous picks` section after a retry
  - scroll transitions between refinement and results should move once without overshooting
  - pressing `Show focused picks` now scrolls to the results region immediately and shows skeletons while final AI selection runs
  - if preview results are already visible during finalization, they now stay on screen with a calmer narrowing-state message instead of disappearing behind a blank loading state
  - no chips
  - `Show products now` stays disabled until discovery is ready
  - skeletons show in a 2x3 layout and only peek into view

## Header/logo notes
- The header uses a separate sharper SVG logo asset for small-size display
- The richer master logo is still kept for larger/fancier contexts
- User noticed the original master logo looked softer on-site because the header version was small and inside extra chrome

## Testing state
- In the latest backend cleanup pass:
  - `npm test -- backend/server.test.js` passed
  - `npm test -- api/search/routes.test.js` passed in the earlier pass
  - after the non-blocking discovery-cache write change, `npm test -- backend/server.test.js` passed again
  - rerunning `npm test -- api/search/routes.test.js` from PowerShell hit a Windows `EPERM` path-resolution error before Vitest ran

## Recent user preferences
- Prefer minimal copy in the open layout
- Prefer no chips in the open layout
- Prefer the PNG wordmark for now rather than forcing a bad SVG recreation
- Want the app to stay production-minded but not overengineered too early

## Strategic context
- User is thinking about:
  - future Next.js migration
  - possible future React Native app using the open layout theme
  - unit economics of search/API costs
  - caching as the major early cost-reduction lever

## If continuing from here
- First read `project-notes/finalize-strategy.md` before making more finalize changes
- Treat the archived reset notes as historical context only, not as current implementation marching orders
- Treat `wordmark.PNG` as the preferred current wordmark asset unless the user explicitly wants another attempt
- The finalize-prompt slimming step is now complete and was re-measured on the same sample queries
- Re-measured finalize on 2026-03-30 after the slimming step:
  - average latency: about 13.9 s
  - average total tokens: about 5403
  - average full guided-search total tokens: about 5574
- Compared with the reset baseline:
  - finalize latency improved from 16.1 s to 13.9 s
  - finalize total tokens improved from 5485 to 5403
  - full guided-search total tokens improved from 5803 to 5574
- The shard-scoring test step was implemented and measured on the same sample queries
- Re-measured finalize on 2026-03-30 after the shard step:
  - average latency: about 16.9 s
  - average total tokens: about 6139
  - average full guided-search total tokens: about 6311
- Compared with the slimmer one-shot finalize step:
  - finalize latency regressed from 13.9 s to 16.9 s
  - finalize total tokens increased from 5403 to 6139
  - full guided-search total tokens increased from 5574 to 6311
- The shard experiment should be treated as a measured failed branch, not as the active path
- The next strategy step is to keep the current guided flow and reassess AI scope, explanation strategy, and badge strategy before more finalize implementation work
- Step 2 is now done; keep future work from drifting back into heavier blocking finalize work by accident
- Treat the intended v1 split as `results first, polish later`:
  - finalize should return the shortlist as soon as core selection is ready
  - badge/explanation after-touch work should not quietly become required blocking work again
- For v1, perceived speed is the priority:
  - prefer showing a trustworthy shortlist sooner over waiting for fuller first-paint polish
