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
- `/api/search/discover` builds the candidate pool and preview set, returns `discoveryToken`, and writes guided discovery cache in the background after response artifacts are ready.
- `/api/search/prewarm` starts after usable discovery candidates exist and stores a reusable `candidate_aware_prewarm` prior in guided discovery cache.
- `/api/search/refine` returns one short user-facing follow-up question with static helper/placeholder copy.
- `/api/search/framing-fields` returns background query-framing fields for timing/debug visibility only.
- `/api/search/finalize` accepts lightweight context, reconstructs the rich candidate pool server-side from guided discovery cache, locks the shortlist, and returns `finalizeFast` plus compatible `results`.
- `/api/search/live` is the explicit manual/debug combined route.
- `/api/search/debug` should describe guided flow as primary.
- `/api/health/supabase` should treat local file fallback as a supported development/storage mode when Supabase is not configured.

## Current AI and latency shape
- Guided refine uses minimal reasoning effort and only asks AI for one short question.
- Query framing is split in `backend/lib/query-framing.js`:
  - `question_fast` powers `/api/search/refine`
  - `framing_fields` powers `/api/search/framing-fields`
- On search submit, the frontend starts guided discovery, question-fast refine, and background framing-fields independently.
- Background framing fields are held client-side for timing/debug visibility; they are not stored server-side or consumed by normal finalize.
- Candidate-aware prewarm is a prior, not a premature final answer.
- Empty-note, refined-note, and retry finalization can use the stored prior or fall back to one-shot finalize.
- Guided finalize currently keeps the slimmer one-shot selector as the active baseline.
- Normal user-facing flow does not send `measurementPreparedQueryFraming`, `measurementSelectionMode: selection_only`, or `measurementSelectionMode: winner_lock_ids_only`; those are temporary measurement-only finalize inputs.
- A temporary local-only measurement route, `POST /api/search/finalize-stream`, exists for the now-measured one-call stream harness. It is not wired to the frontend, not exposed through a Vercel wrapper, and does not change normal `/api/search/finalize` behavior.
- The next nano-lock plus mini async-enrichment idea is planned as harness-only and is not implemented in current app behavior.

## Final result behavior
- Result lists display up to 6 normalized product cards.
- Finalized card results currently include shortlist-safe fields: image, title, merchant/source, price, ratings when available, link when available, and one concise fit reason.
- Finalized cards no longer include drawback/caution copy.
- AI no longer returns badge labels or badge reasons in the blocking finalize response.
- Frontend deterministic presentation logic assigns scan-friendly badge labels after the shortlist arrives, with a slight delayed reveal.
- Clicking a product opens a detail modal with product image, fit explanation, price/ratings, available tradeoff data, and an outbound retailer link when available.
- Richer drawback/caution explanation is planned for a later enrichment layer, not part of blocking finalize today.

### Planned card and modal split (not yet implemented)
- The intended direction is that product cards show metadata only: image, title, merchant/source, price, ratings, and a deterministic badge label.
- AI-generated copy (fit reasons, explanations, tradeoff notes) belongs in the modal only, not on the card surface.
- This decoupling lets cards render immediately from shortlist-safe data while AI copy loads progressively inside the modal.
- The current implementation still includes a fit reason in the blocking finalize card payload. This will need to be adjusted once the async enrichment strategy is settled and the modal loading state is implemented.
- Modal graceful loading state (core facts immediately, explanation sections load progressively) is a known pending implementation step.

## Data, cache, and observability
- Product data comes from the live guided backend path, not a frontend mock catalog.
- Search cache and operational search-history logging use the storage layer, with Supabase preferred and local fallback for development.
- Guided discovery is the reusable persistent cache layer; `/api/search/live` and guided finalization stay request-specific.
- Guided discovery cache keys normalize lowercase/spacing and obvious plural product terms on the main query.
- `search_history` is internal operational telemetry, not user-facing saved history.
- Same-IP search rate limiting currently uses a 10-second rolling window with up to 15 requests.
- Vercel route wrappers forward request headers so production rate limiting can use forwarded client IPs.
- Guided search requests expose `Server-Timing`; timing UI appears in development or with `?timing=1`.
- Guided AI routes surface OpenAI token usage metadata when calls run.
- Structured `[search-flow]` logs cover discovery, refine, framing-fields, prewarm, and finalize.
- Optional Supabase analytics can track guided-search steps, prewarm lifecycle events, result impressions, card opens, and retailer clicks.

## Backend guardrails
- Guided finalize rejects request bodies larger than 32 KB.
- Candidate pools are capped at 20 candidates.
- Follow-up notes are truncated to 500 characters before OpenAI selection.
- Priorities are sanitized and capped before final selection context.
- Finalize reconstructs candidates from guided discovery cache instead of trusting browser-posted rich pools.
- Discovery filtering removes a narrow slice of clearly redundant same-family same-variant listings before the cached candidate pool is written.

## Marketplace direction
- Focamai should help users narrow choices before going into a retailer marketplace.
- Retailer integration should stay flexible and vendor-agnostic in product shape.
- SerpApi is the current near-term search integration until the flow is proven and Amazon Creator API access is available.
- Amazon is the likely future free-tier affiliate priority; Walmart remains worth considering because it has an affiliate path.
- The frontend should not be redesigned around SerpApi because it is an integration layer, not the product identity.

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
