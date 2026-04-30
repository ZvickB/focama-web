# Focamai App Flow

## Purpose
- Canonical note for how the current web app behaves now.
- Keep planning-only architecture in `layered-latency-plan.md`.
- Keep measurement conclusions in `active-experiment-override.md` and the short summary in `current-status.md`.

## Current app structure
- The site uses React Router with a shared layout shell.
- The shared shell includes the logo, top navigation, footer, and trust pages.
- Current public pages: Home, About, Contact, Privacy, Affiliate Disclosure.
- The default homepage is the `open` variant.
- Older homepage UI concepts were removed after the `open` layout direction was chosen.

## Homepage behavior
- The homepage is the main product experience.
- First load shows an HTML boot splash from `index.html` with the PNG wordmark and `Focused shopping`, then fades after app readiness and about 1 second minimum visibility.
- The user starts with a product-search query in a spacious central input.
- After submit:
  - the same area expands into the AI refinement state
  - results skeletons begin below
  - the refinement step stays visually higher-priority than skeletons
  - the page scrolls cleanly to refinement/results without bouncing past them
- `Show products now` reveals the preview set and does not use finalize.
- `Show focused picks` immediately scrolls to the results region and shows skeletons while final AI selection runs.
- If preview results are already visible during finalization, they stay visible with a calmer narrowing-state message.
- `Start a new search` resets guided state to a clean blank search.
- Final results offer `Didn't find anything you like? Tell us why.`
- Retry requires feedback, reuses guided discovery context, excludes rejected shortlist ids, and is capped at 2 follow-up retries.
- After retry succeeds, earlier picks move into a collapsed `Previous picks` section.

## Guided backend flow
- The current homepage flow calls `/api/search/rainforest-discover` for primary guided discovery. `/api/search/discover` still exists as the older generic guided-discovery path and for some backend scripts/tests, but it is not the main homepage route now.
- `/api/search/prewarm` backend route fully removed (2026-04-17).
- `/api/search/refine` returns one short user-facing follow-up question with static helper/placeholder copy.
- `/api/search/finalize` accepts lightweight context, reconstructs the rich candidate pool server-side from guided discovery cache, locks the shortlist via haiku (claude-haiku-4-5-20251001), fetches product details for the locked winners through the current Oxylabs helper, and returns shortlist cards with `feature_bullets` immediately. Mini enrichment still fires async after the response is sent and stores `fit_reason`/`caveat` in the discovery cache.
- `/api/search/enrichment` GET — accepts `?token=&query=`, returns `{ ready: false }` or `{ ready: true, entries: [...] }` where each entry has `candidateId`, `fitReason`, `caveat`. On Vercel this route must receive the original web `Request`, not just a parsed `URL`, because the handler reads `request.url`.
- `/api/search/live` is the explicit manual/debug combined route.
- `/api/search/debug` should describe guided flow as primary.
- `/api/health/supabase` should treat local file fallback as a supported development/storage mode when Supabase is not configured.

## Current AI and latency shape
- Guided refine uses minimal reasoning effort and only asks AI for one short question.
- Query framing is question-fast only now. `/api/search/refine` owns the runtime follow-up question path.
- The old `framing_fields` background lane and `/api/search/framing-fields` route are removed and no longer called by the frontend.
- Finalize uses haiku (claude-haiku-4-5-20251001, ~2s) to lock winners, then fires mini enrichment async after responding.
- Mini enrichment writes `fit_reason` + `caveat` per pick and stores in the discovery cache `selection.enrichment` field.
- Frontend polls `/api/search/enrichment` every 1.5s (30s timeout) and merges enrichment into results by `candidateId`.
- Normal user-facing flow does not send `measurementPreparedQueryFraming`, `measurementSelectionMode: selection_only`, or `measurementSelectionMode: winner_lock_ids_only`; those are temporary measurement-only finalize inputs.
- A temporary local-only measurement route, `POST /api/search/finalize-stream`, exists for the measured one-call stream harness. It is not wired to the frontend and does not change normal finalize behavior.

## Final result behavior
- Result lists display up to 6 normalized product cards.
- Cards still stay clean on the grid surface: image, title, merchant/source, price, ratings, and a deterministic badge label. No AI copy on the card surface.
- The modal now shows manufacturer/product `feature_bullets` immediately when available, before async AI copy arrives.
- AI copy (`fit_reason`, `caveat`) still lives in the modal and arrives via enrichment polling.
- AI no longer returns badge labels in the blocking finalize response. Frontend heuristics assign scan-friendly badges after the shortlist arrives with a slight delayed reveal.
- Clicking a product opens a detail modal. If enrichment has arrived, the modal shows "Why this pick stands out" (`fit_reason`) and "Possible drawbacks" (`caveat`). If enrichment is still pending, those sections show a loading placeholder.
- `enrichmentReady = Boolean(item?.fit_reason)` drives the modal loading state.

## Data, cache, and observability
- Product data comes from the live guided backend path, not a frontend mock catalog.
- Search cache and operational search-history logging use the storage layer, with Supabase preferred and local fallback for development.
- Guided discovery is the reusable persistent cache layer; `/api/search/live` and guided finalization stay request-specific.
- Discovery filtering keeps source diversification for multi-merchant shopping paths such as SerpApi/Google Shopping.
- Discovery filtering disables the per-source diversity cap for Amazon-style single-marketplace paths such as Rainforest, Oxylabs, and any later direct Amazon API path, so all-Amazon searches do not collapse to 2 items.
- Finalize-time product details now also use a separate provider-agnostic per-ASIN cache (`product_details_cache` in Supabase, `temp-data/product-details-cache.json` locally).
- The per-ASIN detail cache returns any stored row immediately, stores partial rows with `needs_updating`, and can kick off a detached refresh for future requests without slowing the current response.
- Cached product details are not fed into the AI shortlist-selection prompt; they only support post-lock product facts for the chosen ASINs.
- Guided discovery cache keys normalize lowercase/spacing and obvious plural product terms on the main query.
- `search_history` is internal operational telemetry, not user-facing saved history.
- Same-IP search rate limiting currently uses a 10-second rolling window with up to 15 requests.
- Vercel route wrappers forward request headers so production rate limiting can use forwarded client IPs.
- Guided search requests expose `Server-Timing`; timing UI appears in development or with `?timing=1`.
- Guided AI routes surface OpenAI token usage metadata when calls run.
- Structured `[search-flow]` logs cover discovery, refine, finalize, and enrichment.
- The Vercel `api/search/*` wrappers are part of the real production execution path, not a thin afterthought. If a handler depends on `request.url`, headers, or body shape, the wrapper test should assert that the original request is forwarded intact.
- Localhost parity caveat: direct Node-server handlers can mask wrapper bugs. Production-only issues can appear when a handler works with the local server contract but the Vercel wrapper passes a different argument shape.
- Optional Supabase analytics can track guided-search steps, result impressions, card opens, and retailer clicks.

## Backend guardrails
- Guided finalize rejects request bodies larger than 32 KB.
- Candidate pools are capped at 20 candidates.
- Follow-up notes are truncated to 500 characters before OpenAI selection.
- Priorities are sanitized and capped before final selection context.
- Finalize reconstructs candidates from guided discovery cache instead of trusting browser-posted rich pools.
- Discovery filtering removes a narrow slice of clearly redundant same-family same-variant listings before the cached candidate pool is written.
- Handler contract guardrail to preserve: avoid mixing `(requestUrl, response)` and `(request, response)` expectations casually. Wrapper-backed routes need explicit passthrough tests whenever a handler depends on the original request object.

## Marketplace direction
- Focamai should help users narrow choices before going into a retailer marketplace.
- Retailer integration should stay flexible and vendor-agnostic in product shape.
- Rainforest API is the primary discovery integration; SerpAPI is preserved as secondary fallback.
- Amazon is the likely future free-tier affiliate priority; Walmart remains worth considering because it has an affiliate path.
- The frontend should not be redesigned around any specific data provider because it is an integration layer, not the product identity.

## UI principles
- Keep the overall feeling calm, focused, premium, and lower-friction than typical marketplaces.
- Mobile-first layout decisions remain the default.
- Loading states should feel intentional, not abrupt.
- Brand elements like wordmark, nav, logo, and footer should remain consistent.

## AI copy tone
- AI-generated copy must read like a trusted assistant, not marketing.
- For each pick, the copy should explain why the AI chose it AND note any meaningful drawback or caveat — without being harsh.
- Drawbacks can be practical (exceeds budget, heavier than alternatives, only works if X) or contextual (better if you care more about Y than Z).
- Do not write copy that sounds like the product is definitely the right choice. Write copy that helps the user decide for themselves.
- Avoid superlatives, hype phrasing, and generic positives. Be specific to the user's stated context.
- This tone applies to all AI copy — fit reasons, modal explanations, and any future enrichment layers.

## Placeholder vs real
- Real now: shell, routing, open homepage, branding/loading fallback, product-card interaction, guided search endpoints, AI-assisted shortlist selection, retailer links when available, Supabase cache/history path, guided-primary debug output.
- Placeholder now: affiliate-specific linking/disclosure behavior, auth flows, deeper analytics/observability, and user-facing saved history.

## Next likely implementation steps
- Keep watching the Vercel deployment using the current cache/storage flow.
- Keep tightening weak-result handling and AI judgment quality.
- Keep the slimmer one-shot finalize selector as active unless the user explicitly approves another experiment.
- For future latency architecture work, use `project-notes/layered-latency-plan.md`; this file describes implemented behavior, not planned layering.
- Decide how affiliate-ready outbound retailer links and disclosures should work in modal/cards.
- Refine the default open homepage based on tester feedback.
