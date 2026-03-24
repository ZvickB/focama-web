# Handoff

## Purpose
- This file is the running checklist for what still needs to be done until the MVP feels complete.
- It should be more durable than `current-status.md`, which is for the immediate next step.
- Update this file whenever a meaningful chunk of work is finished or a new requirement becomes clear.

## Current reality
- The app is live on Vercel.
- The homepage uses the guided `/api/search/discover -> /api/search/refine -> /api/search/finalize` flow.
- The default homepage is now the `open` layout, with alternate variants preserved for comparison.
- SerpApi is wired through Vercel functions.
- The backend prepares a cleaned candidate pool and uses AI to improve the final shortlist.
- Product shortlists are now 6 results instead of 4.
- Basic test coverage exists for backend behavior and homepage search flow.
- Input validation now blocks obviously low-signal queries.
- TanStack Query is installed and used for the homepage search request flow.
- The result cards and modal surface drawbacks/tradeoffs as well as reasons.
- Basic IP-based rate limiting exists on the search endpoints, including `/api/search/finalize`.
- Supabase-backed cache/operational-history storage and health tooling now exist, with local fallback for development.
- The legacy combined `/api/search` route still exists only for backend/debug/manual use.

## Next likely work
- Verify the live deployment end to end on desktop and mobile.
- Watch for weak-result cases and improve result-quality handling without overcomplicating the flow.
- Refine the AI prompt and selection behavior based on real searches.
- Decide whether the next product milestone is:
  - better raw result quality and fallback handling
  - outbound retailer links
  - post-selection tuning and retailer linking

## Known remaining work
- Let the user start a brand-new search for a different product after completing a search; this repeat-search path does not exist yet in the current UI flow.
- After results are shown, add a guided fallback such as `Didn't find anything you like? Tell us why.` so the user can explain what was wrong with the shortlist and send that feedback back into AI for another pass.
- Do not turn this into a generic `load more` pattern; additional results should only be available when the user gives a reason the current options failed, so the product stays recommendation-focused instead of becoming endless search pagination.
- Replace the current `About` destination with a `Why Focama` page that explains what the product is for and how to use it.
- Make sure any header/nav link that currently points people to `About` lands on `Why Focama` instead.
- The `Why Focama` page should include a clear home button so users can easily return to the homepage.
- Right after products load on the homepage, add a clear explanation prompt such as `We think the best choice is X. Click to find out why.` On small screens, use tap-oriented wording instead of click-oriented wording.
- Improve low-confidence search handling so weak or ambiguous searches get a clearer fallback instead of merely plausible results.
- Decide whether to add post-search quality checks in addition to the current pre-search validation.
- Keep the rule-based filter focused on removing junk, duplicates, and weak candidates rather than trying to make the final shortlist by itself.
- The AI final-selection step should keep using the textarea context/details as the main decision signal.
- Ratings and review counts should remain important supporting quality signals in the AI handoff, alongside relevance, price, source, and diversity.
- Decide how much stronger the current rate limiting / abuse protection needs to become before broader sharing.
- Add outbound retailer links once the search pipeline feels trustworthy enough.
- Decide how Amazon vs Walmart vs broader-provider support should work by tier without making the product feel provider-specific.
- Tighten privacy/compliance language if analytics stays enabled and as affiliate behavior becomes real.
- Keep search history operational-only for now; if user-facing saved history is ever added, build it as a separate product feature and data model instead of exposing the current telemetry table.
- Keep an eye on rate limiting, cache TTL strategy, and API costs once usage increases.

## Nice-to-have polish
- Do another small pass on result-card readability and image overlays.
- Recheck the mobile product-detail sheet behavior and CTA placement.
- Continue polishing the default open homepage based on tester feedback.
- Add a clearer empty / no-good-results state.
- Add a tiny admin/debug view or lightweight internal tool for checking cache hit/miss behavior without one-off scripts.

## Longer-term ideas after v1
- Add user accounts/login only when there is a clear product need for persistence and personalization rather than just infrastructure completeness.
- Add saved searches as an explicit user-facing feature after v1 instead of repurposing the current operational `search_history` telemetry table.
- Explore preference learning/personalization later, but design it explicitly around user consent, transparent controls, and lightweight signals from searches, rejects, stated priorities, and saved items rather than hidden black-box profiling.
- If preference learning is added, start with structured signals instead of AI-first profiling. Examples: repeated clicks on `best price`, `best reviews`, or similar result traits; repeated rejections tied to price, brand, size, or use-case mismatch; and lightweight stored preference variables per user.
- Treat learned preferences as a secondary ranking/tie-breaker signal, not the main decision-maker. Current search intent and the user's live query details should stay stronger than long-term history.
- Use AI for preference learning only where it materially helps, such as interpreting free-text feedback or incorporating saved preference signals into later ranking. Do not assume preference memory alone will create a major response-quality jump.

## Filtering direction
- Rule-based filtering should clean the raw SerpApi pool first:
  - remove garbage
  - remove duplicates / near-duplicates
  - down-rank weak listings
- The backend should keep a larger cleaned candidate set for AI instead of collapsing too early.
- AI should then choose or refine the final shortlist using:
  - product query
  - user context/details as the main fit signal
  - ratings and review counts as important quality signals
  - diversity across plausible options

## Definition of "good enough for this MVP phase"
- A user can open the live app, search for a real product need, and get 6 sensible results without errors.
- Obviously bad input is blocked with a helpful message.
- The shortlist should feel more context-aware than raw search results and should mention meaningful tradeoffs when useful.
- The app does not feel tied to one marketplace even if affiliate priorities differ behind the scenes.
- The deployed experience is stable enough that the next work can focus on product quality rather than infrastructure.

## Temporary-only note
- Any local cache, saved query list, or evaluation dataset used during development is temporary tooling only.
- It is not the long-term product storage model.
- Before launch or before real user history matters, this temporary data approach should be removed, replaced, or clearly isolated behind the proper persistent design.
- The existing `search_history` table should stay limited to operational logging and should not quietly become that persistent user-history design.
