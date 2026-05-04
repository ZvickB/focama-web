# Focamai To-Do List

Active backlog only. Completed items were moved into `project-notes/archive/completed-work-2026-05-03.md`.

---

## AI / Core Flow

| Status | Item |
|--------|------|
| pending | Verify the browser golden path end to end — cards should load fast and modal AI reasoning should appear when enrichment arrives |
| pending | Check AI copy tone in the modal so it sounds like a trusted assistant with honest caveats, not marketing |
| pending | Re-measure the live flow after any meaningful finalize or latency change |
| pending | Explore embeddings for better semantic dedup and diversity only if analytics show candidate quality is the real bottleneck |

---

## UI Polish

| Status | Item |
|--------|------|
| pending | Fix onboarding/search-expectation clarity so new users understand to start with the product query and use the next step for narrowing |
| pending | Add more intentional loading states between search, refine, and results |
| pending | Improve low-confidence search handling so weak or ambiguous searches get a clearer fallback |
| pending | Decide whether to add a proactive pool-mismatch nudge before the user asks for retry advice |
| pending | Replace the About page with a `Why Focamai` page |
| pending | Update header/nav links to point to `Why Focamai` once it exists |
| pending | Add a clear home button to the `Why Focamai` page |
| pending | Add a short post-results prompt that points people toward the best pick without sounding salesy |
| pending | Add a lightweight internal view for checking cache hit/miss and funnel health without one-off scripts |

---

## Backend

| Status | Item |
|--------|------|
| pending | Trim `backend/server.js` incrementally so orchestration helpers keep moving out of the main route file |

---

## SEO

| Status | Item |
|--------|------|
| pending | Add meta descriptions and page titles to all pages |
| pending | Add structured data / schema markup |
| pending | Review and improve overall SEO setup beyond favicon |

---

## Pre-Launch / Security

| Status | Item |
|--------|------|
| pending | Keep missing or expired `discoveryToken` failures on a clean user-safe restart path before broader sharing |
| pending | Decide whether current in-memory rate limiting is strong enough before broader sharing |
| pending | Document what stronger abuse protection would look like if the app is opened up more widely |

---

## Caching & DB

| Status | Item |
|--------|------|
| pending | Decide whether to add cleanup for expired cache/history rows if Supabase growth becomes a problem |

---

## Analytics

| Status | Item |
|--------|------|
| pending | Write practical Supabase queries or a small internal view for funnel metrics and click behavior |
| pending | Keep per-step timing visibility strong enough to compare discovery, refine, finalize, and enrichment changes |

---

## Business / Product Decisions

| Status | Item |
|--------|------|
| pending | Decide how affiliate retailer links should appear in cards and the product modal |
| pending | Decide Amazon vs Walmart vs broader provider support by tier |
| pending | Tighten privacy and affiliate disclosure language once real affiliate links are live |
| pending | Add saved searches as a user-facing feature after v1 without reusing the internal `search_history` table |

---

## Long Term

| Status | Item |
|--------|------|
| long term | Design and implement a monetization strategy — see `project-notes/monetization-strategy.md` |
| long term | Add user accounts and login if persistence becomes a clear product need |
| long term | Explore preference learning as a light secondary signal after the core shortlist flow is proven |
| long term | Build a subscriber tier with premium features once the free core flow is solid |
