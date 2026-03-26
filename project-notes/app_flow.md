# Focamai App Flow

## Purpose of this file
- This file tracks how the current web app behaves right now.
- It should hold implementation behavior, temporary adaptations, and MVP assumptions.
- Within `project-notes`, `doc_briefs.md` should stay focused on product intent, stack direction, and broader decisions.

## Current app structure
- The site uses React Router with a shared layout shell.
- The shared shell includes the logo, top navigation, footer, and trust pages.
- The current public pages are:
  - Home
  - About
  - Contact
  - Privacy
  - Affiliate Disclosure
- The default homepage is the `open` variant.
- Older homepage UI concepts were removed after the `open` layout direction was chosen.

## Current homepage behavior
- The homepage is the main product experience.
- The user lands on a spacious search-first screen with the wordmark, a central input, and minimal copy.
- On first load, a true HTML boot splash now shows `Focused shopping` immediately before React loads, then fades away once the app is ready and the splash has been visible for about 1 second total.
- After the user submits a product query:
  - the same area expands into the AI refinement state
  - the results area begins shimmering below
  - the refinement step stays visually higher-priority than the skeletons
  - the page should scroll cleanly to the refinement area once, without bouncing past it
- When preview or final results are revealed from the guided flow, the page should scroll down to that results region without needing a manual swipe.
- When the user presses `Show focused picks`, the page should immediately scroll to the results region and swap into loading skeletons while final AI selection is in progress.
- Once a search has started, the homepage now includes a `Start a new search` action that resets the guided state back to a clean blank search.
- After final results appear, the homepage now offers a feedback-based retry path through `Didn't find anything you like? Tell us why.`
- Retry passes reuse the existing guided discovery context through `/api/search/finalize` and require feedback before another shortlist is generated.
- The retry path is intentionally capped at 2 follow-up retries so the product stays guided instead of becoming endless browsing.
- On retry, the previously rejected shortlist is excluded from AI reselection rather than merely down-ranked.
- After a retry succeeds, the earlier shortlist moves into a collapsed `Previous picks` section so the newest shortlist stays primary.
- The homepage now uses a guided search flow:
  - discovery starts through `/api/search/discover`
  - the follow-up prompt comes from `/api/search/refine`
  - final focused picks come from `/api/search/finalize`
  - `/api/search/discover` now returns the preview set plus a `discoveryToken` tied to the cached guided candidate pool
  - `/api/search/finalize` now accepts lightweight context such as the query, `discoveryToken`, follow-up notes, retry feedback, and excluded ids
  - the backend rebuilds the rich candidate pool from guided discovery cache before calling OpenAI
  - this guided flow is the primary backend architecture for the live product experience
  - `/api/search/live` is the explicit manual/debug combined-search endpoint
  - the Vercel route wrappers now forward request headers into the backend handlers so IP-based rate limiting can still key off forwarded client IPs in production
- Backend debug/health tooling should mirror that same split:
  - `/api/search/debug` should describe the guided flow as primary
  - `/api/search/live` should be treated as the manual combined route
  - `/api/health/supabase` should treat local file fallback as a supported development/storage mode when Supabase is not configured
- Guided search requests now expose backend stage timing through `Server-Timing` headers, and the homepage shows the timing panel in development or when `?timing=1` is present for discover, refine, and finalize.
- Guided candidate/result normalization now skips promo-only description text such as sale blurbs, and the finalize AI summary now omits empty/generic filler descriptions plus redundant source/price/delivery boilerplate to reduce prompt waste.
- The backend candidate pool is now a more provider-agnostic structured layer:
  - duplicate-family keys and variant tokens are attached before AI selection
  - lightweight attribute tags are extracted from product text
  - trust signals are pre-scored before finalize so AI gets cleaner compact guidance
- After loading/refinement, the page displays up to 6 normalized product cards.
- Clicking a product opens a detail modal with:
  - product image
  - short explanation
  - price and ratings
  - drawbacks/tradeoffs
  - an outbound retailer link when one is available

## Current MVP assumptions
- Product data comes from the live search backend path rather than a frontend mock catalog.
- The backend now filters candidates and uses AI to improve the final shortlist rather than simply returning the first raw usable results.
- Search cache plus operational search-history logging now exists through the storage layer, with Supabase preferred and local fallback for development.
- `search_history` is currently an internal operational record for cache/debug visibility, not a user-facing saved-history product feature.
- Guided discovery is the reusable persistent cache layer; `/api/search/live` and guided finalization stay request-specific.
- Guided discovery cache keys now normalize lowercase/spacing and obvious plural product terms on the main query so trivial singular/plural query variations can reuse the same cache entry more often.
- The production deployment at `focama.vercel.app` is now successfully using Supabase-backed guided discovery caching.
- Guided finalization is now explicitly guarded:
  - request bodies larger than 32 KB are rejected
  - candidate pools are capped at 20 candidates
  - follow-up notes are truncated to 500 characters before going to OpenAI
  - priorities are sanitized and capped before they are merged into final selection context
  - finalize reconstructs the candidate pool from the cached guided-discovery entry on the server before AI selection, instead of trusting a browser-posted rich pool
- Retailer product links can already appear in the modal, but affiliate handling and disclosure strategy are not finalized.

## Marketplace direction
- Focamai is meant to help users narrow choices before going into a retailer marketplace.
- Retailer integration should stay flexible.
- The app should not be tightly designed around one marketplace unless that becomes a stable product decision.
- SerpApi is the current near-term search integration direction.
- Amazon is the current priority for the future free tier because its affiliate program is the strongest likely starting point.
- A paid tier may also use SerpApi more directly to give users a wider range of results.
- Even in the paid tier, vendors with stronger affiliate programs should generally be prioritized over vendors with no program at all.
- Walmart is still worth considering because it has an affiliate path, while vendors with no affiliate option should usually only be shown when the user benefit is clearly meaningful.
- SerpApi is the working integration for now until the search flow is proven and Amazon Creator API access is available.
- The frontend should not be redesigned around SerpApi because it is a temporary integration layer, not the product identity.

## UI principles
- The overall feeling should remain calm, focused, and lower-friction than typical marketplaces.
- The homepage should feel useful and premium on first load, not like a dashboard.
- Mobile-first layout decisions should remain the default.
- Loading states should feel intentional, not abrupt.
- Brand elements like the wordmark, nav, logo, and footer should remain consistent even when homepage content changes.

## Placeholder vs real
- Real now:
  - site shell
  - routing
  - open-layout default homepage
  - branding and loading fallback
  - product-card interaction pattern
  - live guided search endpoints
  - explicit legacy/manual combined search through `/api/search/live`
  - AI-assisted shortlist selection
  - outbound retailer product links when available
  - Supabase-backed cache/history path
  - debug output aligned to guided-primary plus legacy-live backend behavior
- Placeholder now:
  - affiliate-specific linking/disclosure behavior
  - auth flows
  - deeper analytics/observability
  - any user-facing saved-history feature built on a dedicated product data model

## Next likely implementation steps
- Keep watching the Vercel deployment using the current cache/storage flow.
- Keep tightening weak-result handling and AI judgment quality.
- Decide how affiliate-ready outbound retailer links and disclosures should work in the modal and cards.
- Refine the default open homepage based on tester feedback.
