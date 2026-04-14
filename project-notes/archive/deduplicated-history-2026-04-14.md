# Deduplicated History Archive - 2026-04-14

## Purpose
- Historical record of repeated note content removed during the 2026-04-14 notes de-duplication pass.
- This file is archive-only. Do not treat it as active product direction.
- Active canonical notes remain:
  - `project-notes/current-status.md`
  - `project-notes/app_flow.md`
  - `project-notes/finalize-strategy.md`
  - `project-notes/active-experiment-override.md`
  - `project-notes/layered-latency-plan.md`

## Why this was archived
- The same finalize/prewarm/layered-latency history was repeated across `current-status.md`, `session-handoff.md`, `handoff.md`, and `app_flow.md`.
- Future chats were paying token cost to reread the same chronology several times.
- The active notes now link to canonical summaries instead of restating this history in full.

## Homepage and UI history
- The default homepage moved to the `open` layout after older split-screen and chip-heavy homepage variants were removed.
- The open layout became the product direction because it is calmer, more spacious, more mobile-friendly, and more search-first.
- The homepage adopted the PNG wordmark and Instrument Sans.
- Chips were removed from the open layout.
- The homepage added:
  - an AI refinement area after search
  - `Start a new search`
  - preview results
  - final AI narrowing
  - retry feedback after final results
  - a collapsed `Previous picks` section after retry
  - smoother scroll transitions between search, refinement, and results
- The boot splash moved into `index.html` so throttled/slow loads show branding before React finishes.
- The boot splash shows the PNG wordmark plus `Focused shopping`, includes a static header shell, and fades after React is ready and a minimum visible duration.

## Guided search and cache history
- The homepage moved to the guided flow:
  - `/api/search/discover`
  - `/api/search/refine`
  - `/api/search/finalize`
- `/api/search/live` stayed as the explicit manual/debug combined route.
- Product shortlists changed from 4 to 6 items end to end.
- Guided discovery became the only persistent cache boundary.
- Guided discovery started returning a `discoveryToken`.
- Guided finalize changed from browser-posted rich candidate pools to lightweight finalize context plus server-side reconstruction from guided discovery cache.
- Guided finalize body limit returned to 32 KB after payloads became lightweight again.
- Supabase-backed guided discovery cache was confirmed working in production on `focama.vercel.app`.
- Local file cache remained a development/fallback path.
- `search_history` was clarified as internal operational telemetry, not user-facing saved history.
- Guided discovery cache keys started normalizing query casing, whitespace, and obvious plural product terms more conservatively.
- Guided discovery began returning before the Supabase cache write finished, so first-hit latency was no longer blocked by cache persistence.

## Rate limiting and observability history
- Shared rate limiting moved toward a Supabase-backed event table when configured, with in-memory fallback for local/degraded environments.
- Same-IP search limiting was set to 15 requests in a 10-second rolling window for tester-friendly friction.
- Vercel API wrappers were updated to preserve forwarded headers so IP-based rate limiting works in production.
- Vercel route wrappers were deduplicated through a small bridge helper, while the backend still keeps a transitional Node-shaped handler contract.
- Guided discovery, refine, finalize, framing, and prewarm gained structured `[search-flow]` logs with route/mode, latency, token usage, candidate counts, and ranking ownership.
- Guided search responses started exposing `Server-Timing` headers.
- The homepage gained a timing panel in development or with `?timing=1`.
- Guided refine/finalize and live-search responses started surfacing OpenAI token usage metadata.
- `/api/search/debug` was updated to describe guided flow as primary and `/api/search/live` as uncached manual/debug.
- `/api/health/supabase` was updated to treat unconfigured Supabase as optional local fallback, not a backend failure.

## Analytics history
- A best-effort analytics endpoint was added at `POST /api/analytics/track`.
- Optional Supabase analytics tables were added for search runs, events, result impressions, and result clicks.
- The homepage began emitting events for:
  - search start
  - discovery loaded
  - refinement viewed
  - `Show products now`
  - AI follow-up submitted
  - final results shown
  - result impressions
  - result card opens
  - retailer click-throughs
- Result analytics started distinguishing preview, final, retry, and previous-result sets.
- Prewarm lifecycle analytics were added for started, ready, waited-on, consumed, unused, aborted, and failed events.

## Refine slimming history
- Guided refine originally returned more AI-generated helper content.
- It was slimmed so AI now returns only one short ranking/refinement question.
- Helper text and textarea placeholder became static server-side copy.
- Guided refine moved to minimal reasoning effort.
- Re-measured refine on 2026-03-30 after slimming:
  - average latency: about 1.1 s
  - average total tokens: about 172
- Reset baseline before slimming:
  - refine average latency: about 3.4 s
  - refine average total tokens: about 318

## Finalize slimming history
- The staged/persisted finalize experiment was archived off `main`; reset baseline returned as the active branch state.
- The March 2026 reset baseline measured:
  - finalize average latency: about 16.1 s
  - finalize average total tokens: about 5485
  - full guided-search average total tokens: about 5803
- Finalize prompt slimming removed or reduced:
  - top-level search-state/similar-query prompt text
  - backend-only match-signal fields
  - duplicate numeric-price fields
  - verbose trust metadata
  - nonessential variant tokens
  - empty/generic filler descriptions
  - redundant source/price/delivery boilerplate
  - promo-only description text such as sale blurbs
- Candidate JSON sent to OpenAI was minified.
- The active one-shot finalize prompt also removed the standalone `Prioritize:` heading, merged diversity/near-duplicate guidance, removed the redundant allowed badge-label prompt line, and shortened badge strategy wording.
- Re-measured finalize after prompt slimming on 2026-03-30:
  - average latency: about 13.9 s
  - average total tokens: about 5403
  - average full guided-search total tokens: about 5574

## Shard-scoring experiment history
- A compact in-request shard-scoring finalize experiment was implemented and measured.
- It regressed compared with the slimmer one-shot finalize path:
  - finalize latency increased from about 13.9 s to about 16.9 s
  - finalize tokens increased from about 5403 to about 6139
  - full guided-search tokens increased from about 5574 to about 6311
- The shard experiment was rolled back.
- Guided finalize returned to the slimmer one-shot selector as the active baseline.

## Badge and card-scope history
- Blocking finalized results were slimmed so each pick keeps one concise AI fit reason.
- Badge reasons were removed from the blocking finalize contract.
- Drawback/caution text moved off the result card grid and became modal/planned-enrichment territory.
- Homepage copy was updated to explain:
  - the first query should look like the product search a user would type into Google
  - refine is for natural-language narrowing such as budget, size, comfort, style, or use case
- AI badge-label assignment was removed from the blocking finalize response.
- Frontend deterministic heuristics now assign badge labels after final results arrive, with a slight delayed reveal.
- Cached same-query finalize measurement after badge-scope reduction:
  - finalize average latency: about 7.5 s
  - finalize average OpenAI time: about 7.0 s
  - finalize average total tokens: about 2479
  - full guided-search average total tokens: about 2651
  - this improved finalize by about 2.5 seconds on average and crossed the under-8-second cached finalize milestone.

## Candidate cleanup history
- Candidate filtering gained provider-agnostic duplicate-family metadata, compact attribute tags, and trust signals.
- A conservative same-family collapse pass was added before AI selection.
- Collapse only applies when duplicate-family key and variant signature match, plus merchant matches or price is effectively the same.
- Meaningful family differences, such as waterproof vs non-waterproof, should survive into the AI pool.
- A fresh-discovery rerun after family collapse measured:
  - fresh finalize average latency: about 10.8 s
  - fresh finalize average total tokens: about 2617
- That rerun was directional only because live discovery changed candidate pools; the isolated win remained badge-scope reduction.

## Prewarm and model-routing history
- A broader candidate-aware prewarm architecture was implemented:
  - guided discovery starts `/api/search/prewarm` after usable candidate data exists
  - prewarm stores reusable candidate-aware prior data in guided discovery cache
  - prewarm does not lock the shortlist or materialize final cards directly
  - finalize can use the stored prior or fall back to the one-shot selector
- Older direct-artifact/prewarmed-card shortcut behavior improved empty-notes finalize but did not solve context-added finalize latency.
- Live reruns on 2026-03-31 showed:
  - empty-notes finalize after artifact readiness could return in about 0.5 s in the older direct-artifact shortcut
  - refined finalize with added context still took about 8.8 s to 12.0 s
  - retry with feedback took about 17.0 s
  - refined/retry reused the artifact but still relied on fresh heavy OpenAI rerank work
- Context-added guided finalize later defaulted to a faster `gpt-5.4-nano` lane, while empty-note finalize stayed on the baseline lane.
- `OPENAI_FINALIZE_CONTEXT_MODEL` and `OPENAI_FINALIZE_EMPTY_MODEL` were added as overrides.
- A separate context-added measurement found the nano lane materially quicker on the same guided flow:
  - baseline context-added finalize average latency: about 12.1 s
  - nano context-added finalize average latency: about 4.6 s
  - tokens stayed roughly flat while OpenAI time dropped by about 7.4 s
- This model routing was useful, but it did not answer the deeper first-pass/second-pass architecture question by itself.

## Layered-latency groundwork history
- `project-notes/layered-latency-plan.md` became the planning reference for the preferred layered strategy.
- `backend/lib/layered-contracts.js` defined contracts for:
  - `query_framing`
  - `candidate_aware_prewarm`
  - `finalize_fast`
  - `enrichment`
- Query framing moved into `backend/lib/query-framing.js`.
- Query framing split into:
  - `question_fast`
  - `framing_fields`
- `backend/lib/refinement-assistant.js` now adapts only `question_fast` into the current refine response.
- `/api/search/framing-fields` exposes the richer background lane.
- The frontend starts guided discovery, question-fast refine, and background framing-fields independently on search submit.
- Framing fields are currently timing/debug context only; they are not stored server-side or consumed by normal finalize.
- Guided finalize now returns `finalizeFast` plus compatible `results`.
- Enrichment is still planned, not an implemented separate pass.

## Prepared-framing measurement history
- A temporary measurement-only input, `measurementPreparedQueryFraming`, was added to `/api/search/finalize`.
- The normal product flow does not send or depend on it.
- Prepared framing was measured on 2026-04-13 with the same discovery token reused for baseline vs prepared finalize.
- Narrow finalize-only result:
  - baseline finalize average latency: about 5.0 s
  - prepared-fields finalize average latency: about 4.4 s
  - baseline finalize average total tokens: about 2289
  - prepared-fields finalize average total tokens: about 2453
  - extra framing-fields call averaged about 3.8 s and about 353 tokens
  - shortlist quality looked mixed
- Interpretation:
  - simply injecting prepared framing into the current finalize call is not enough
  - do not treat this as proof that the broader perceived-latency idea failed
  - the real unmeasured target was the blocking shortlist-lock step and first image-safe shortlist paint.

## Layered harness measurement history
- `backend/scripts/measure-guided-finalize.js` gained a temporary `layered` mode.
- It starts discover, question-fast refine, and background framing-fields in parallel like the frontend.
- It models configurable think time plus current prewarm wait before finalize can start.
- On the 5-case context set:
  - question-fast averaged about 1.5 s
  - framing-fields averaged about 6.6 s
  - framing was ready by submit in about 60% of cases at a 3-second think-time assumption
  - baseline finalize shortlist-lock averaged about 5.2 s server-side
  - prepared finalize averaged about 5.9 s and used more tokens
  - projected blocking shortlist-lock under 1.5 s, 3 s, and 5 s think-time assumptions stayed around 5.0 s to 5.8 s
  - first image-safe shortlist paint proxy stayed around 9.6 s to 10.2 s once current prewarm wait was included
- No measured case got near the previously misstated sub-600 ms goal.
- The corrected target is about 6000 ms.
- Quality looked mixed-to-worse with prepared framing, not better.
- Recommendation: pause prepared-framing injection unless a future pass attacks shortlist-lock directly.

## Selection-only shortlist-lock history
- A temporary measurement-only finalize field, `measurementSelectionMode: selection_only`, was added.
- The measurement harness gained `--mode selection-only`.
- That variant sends AI only:
  - `id`
  - `rank`
  - `title`
  - `source`
  - `price`
  - `rating`
  - `reviewCount`
  - `trustScore`
- It bypasses the stored candidate-aware prior and excludes prepared framing, descriptions, attributes, reasons, and richer explanation work.
- On the 5-case context set:
  - baseline shortlist-lock averaged about 5.2 s
  - selection-only averaged about 3.2 s
  - selection-only used about 1474 tokens vs about 1891 baseline
  - image-safe shortlist paint proxy matched finalize client total for this narrow pass because browser paint was not instrumented
- Quality read:
  - coffee grinder looked better
  - desk lamp looked roughly similar
  - stroller, office chair, and running shoes looked worse or less trustworthy
- Working conclusion:
  - thinner blocking shortlist-lock materially helps speed
  - this exact thin payload clears the corrected about-6000 ms target on this run
  - this exact thin payload does not preserve quality confidently enough to validate it
  - the next question is quality-preserving shortlist locking, not whether thinning can help at all

## Testing notes preserved from removed handoffs
- Relevant backend tests passed in earlier passes:
  - `npm test -- backend/server.test.js`
  - `npm test -- api/search/routes.test.js`
- After the non-blocking discovery-cache write change, `npm test -- backend/server.test.js` passed again.
- A later PowerShell rerun of `npm test -- api/search/routes.test.js` hit a Windows `EPERM` path-resolution error before Vitest ran.

## Strategic context preserved from removed handoffs
- The user has been thinking about:
  - future Next.js migration
  - possible React Native app using the open layout theme
  - unit economics of search/API costs
  - caching as the major early cost-reduction lever
- Product should stay production-minded but not overengineered before v1 usage justifies it.
