# Focamai To-Do List

Pending items at the top. Done items at the bottom.  
AI maintains this file. Each item should be one plain sentence.

---

## AI / Core Flow

| Status | Item |
|--------|------|
| pending | Verify golden path in the browser — cards load fast at ~2s, modal fills in with AI explanation when enrichment arrives |
| pending | Check AI copy tone in the modal — should sound like a trusted assistant with honest caveats, not marketing (see office chair example in CLAUDE.md) |
| done | Remove leftover prewarm code |
| done | Remove temporary measurement fields (`measurementPreparedQueryFraming`, `measurementSelectionMode`, `winner_lock_ids_only`) from finalize |
| done | Remove local-only `/api/search/finalize-stream` route and `stream-clean` harness mode |
| pending | Make the user's follow-up answer the dominant signal in final product selection (currently sharing weight with other factors) |
| done | Remove `SIMULATE_ENRICHMENT_DELAY_MS` simulation block from `HomeShared.jsx` — was used for testing, not needed in production |
| pending | Decide whether to keep or remove `selectAiResults` path in `ai-selector.js` — finalize no longer calls it directly |
| pending | Re-measure the full layered flow on the same sample queries after any finalize/latency change |
| pending | Explore OpenAI embeddings for semantic dedup and concept-diversity in the 70→20 candidate selection in `result-filter.js` — validate via analytics that candidate quality is the bottleneck first |

---

## UI Polish

| Status | Item |
|--------|------|
| pending | Add stagger + drop entrance animation to result cards using Motion for React — buys ~1s of visual activity while enrichment arrives, parameters: y:-12, duration 0.45s, stagger 0.13s between cards |
| pending | Replace manual timer animation in `RefinementCopy` with Motion `AnimatePresence` — removes ~90 lines of fragile useEffect/setTimeout code |
| pending | Add scale + fade entrance/exit to `ProductDetailModal` using Motion `AnimatePresence` |
| pending | When Amazon bullet point descriptions are available, surface them on product cards or in the modal so users can read them before AI personalization loads |
| done | Add a shimmer or skeleton animation to the AI personalization area while it is still generating, so users can see it is actively loading |
| done | Make the "Show products now" button more visually prominent — it should be obvious and inviting, not easy to miss |
| done | Widen the results container on desktop — currently too narrow and leaves dead space on wide monitors |
| done | Put "Show focused picks" and "Show products now" side by side on desktop instead of stacked |
| done | Fix product card — image is too small, price shows before title, description is hidden on mobile |
| done | Fix card hover state — the lift animation and shadow don't match and look detached |
| pending | Add proper loading states between search steps so the transition from search to refine to results feels intentional |
| done | Add an empty / no-good-results screen so the page isn't just blank when nothing comes back |
| pending | Improve low-confidence search handling — weak or ambiguous searches should get a clearer fallback message instead of showing poor results silently |
| pending | Pool mismatch nudge — when the discovery pool doesn't match the user's follow-up context (e.g. searched "lego", context was "for a 9-year-old" but pool was adult sets), show closest results and suggest a better search query derived from their own context |
| done | Recheck mobile product-detail sheet behavior and CTA placement |
| pending | Replace the About page with a "Why Focamai" page explaining the product |
| pending | Update header/nav links to point to Why Focamai once the page exists |
| pending | Add a clear home button to the Why Focamai page once it exists |
| pending | After results load, add a short prompt pointing to the best pick — something like "We think X is your best bet — tap to see why" |
| pending | Add a lightweight internal view for checking cache hit/miss rates without running scripts |

---

## Backend

| Status | Item |
|--------|------|
| done | Add timeouts to SerpApi and OpenAI calls — right now a slow or hung response silently stalls the whole request |
| done | Pass user location to both Rainforest API and SerpApi so results default to localized pricing, availability, and listings |
| pending | Trim `server.js` — route logic, request parsing, and business logic are all mixed in one 1300+ line file |
| done | Strip internal error details from API error responses before public launch |

---

## Pre-Launch / Security

| Status | Item |
|--------|------|
| pending | Add a controlled fallback for missing `discoveryToken` state — dev mode throws; production needs a cleaner failure path before broader sharing |
| pending | Add a shared secret header check (`X-Api-Key`) on all API endpoints — currently any caller with curl can hit endpoints and burn Rainforest/OpenAI credits |
| done | Restrict CORS from wildcard to your own domain — locked to `focama.vercel.app` in prod, `localhost:5173` in dev via `ALLOWED_ORIGIN` env var |
| done | Add a React Error Boundary so a JS crash doesn't white-screen the whole app |
| pending | Make the discovery token a random ID instead of a predictable string — right now anyone who knows the query can guess it |
| pending | Decide how strong rate limiting and abuse protection need to be before broader sharing |
| pending | Add `Vary: Origin` header to API responses so CDN/proxy caches don't serve the wrong CORS headers to different origins |

---

## Caching & DB

| Status | Item |
|--------|------|
| pending | Add a Supabase cleanup job to delete expired cache and rate-limit rows — they accumulate forever right now |
| pending | Fix the rate limit race condition in Supabase — concurrent requests can slip through the counter |
| pending | Create the four funnel analytics tables in Supabase — SQL is ready in `project-notes/analytics-funnel-schema.sql`, just needs to be run |

---

## Analytics

| Status | Item |
|--------|------|
| next | Wire the backend to write to the four analytics tables so funnel data starts collecting from first real users |
| next | Wire frontend click and impression events so card views and retailer clicks are recorded |
| pending | Write basic Supabase queries to read the funnel analytics tables — search-to-finalize rate, click rate by position, retry rate |
| pending | Add per-layer timing logging so each search step (discover, refine, finalize, enrichment) can be measured and compared independently |

---

## Business / Product Decisions

| Status | Item |
|--------|------|
| pending | Decide how affiliate retailer links appear in product cards and the detail modal |
| pending | Decide Amazon vs Walmart provider support by tier |
| pending | Tighten privacy and affiliate disclosure language once real affiliate links are live |
| pending | Add saved searches as a user-facing feature after v1 — do not reuse the internal `search_history` table for this |

---

## Long Term

| Status | Item |
|--------|------|
| long term | Design and implement a monetization strategy — core principles are in `project-notes/monetization-strategy.md` |
| long term | Add user accounts and login so searches and preferences can be saved across sessions |
| long term | Add saved searches as a user-facing feature — keep separate from the internal `search_history` table |
| long term | Explore preference learning — remember what kinds of picks a user tends to choose or reject and use as a light secondary signal |
| long term | Build a subscriber tier with premium features such as deeper product data, more picks, or faster results |
| long term | Add outbound affiliate retailer links in cards and modal once the pipeline feels trustworthy and compliance language is in place |

---

## Done

| Status | Item |
|--------|------|
| done | Nano-lock + mini async enrichment wired — cards appear at ~2s, AI explanation fills in async via polling |
| done | Prewarm disabled — experiments showed it was slowing finalize down, not speeding it up |
| done | Rainforest API added as primary discovery endpoint, SerpAPI preserved as secondary |
| done | Supabase-backed discovery cache confirmed working in production |
| done | Badge scope reduction — cached finalize crossed the under-8s milestone |
| done | Query framing split into question-fast and background framing-fields lanes |
| done | Rate limiting, caching, and search history wired with Supabase + local dev fallback |
| done | Input validation blocks low-signal queries before hitting the AI |
| done | Retry loop with feedback — 2-pass cap, excludes rejected picks, collapses previous picks |
| done | Boot splash and branding — PNG wordmark, Instrument Sans, fades after app is ready |
