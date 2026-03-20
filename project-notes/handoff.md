# Handoff

## Purpose
- This file is the running checklist for what still needs to be done until the MVP feels complete.
- It should be more durable than `current-status.md`, which is for the immediate next step.
- Update this file whenever a meaningful chunk of work is finished or a new requirement becomes clear.

## Current reality
- The app is live on Vercel.
- The homepage uses the live `/api/search` route.
- SerpApi is wired through Vercel functions.
- The backend now prepares a cleaned candidate pool and is ready for AI final selection.
- Basic test coverage exists for backend behavior and homepage search flow.
- Input validation now blocks obviously low-signal queries.
- A temporary local evaluation dataset now lives at `temp-data/search-evaluation.json` and is meant only for development review.

## Next likely work
- Add `OPENAI_API_KEY` locally and in Vercel so the AI final-selection path can run in real searches.
- Verify the live deployment end to end on desktop and mobile.
- Watch for weak-result cases and improve result-quality handling without overcomplicating the flow.
- Decide whether the next product milestone is:
  - better raw result quality and fallback handling
  - outbound retailer links
  - post-selection tuning and retailer linking

## Known remaining work
- Improve low-confidence search handling so weak or ambiguous searches get a clearer fallback instead of merely plausible results.
- Decide whether to add post-search quality checks in addition to the current pre-search validation.
- Keep the rule-based filter focused on removing junk, duplicates, and weak candidates rather than trying to make the final 4 picks by itself.
- The AI final-selection step should use the textarea context/details as the main decision signal.
- Ratings and review counts should remain important supporting quality signals in the AI handoff, alongside relevance, price, source, and diversity.
- If we keep building up a local cache or evaluation dataset of queries/results for development, treat it as temporary-only tooling.
- Any temporary local query cache or evaluation dataset must be removed, replaced, or clearly isolated before the product relies on real persistent user data.
- Add outbound retailer links once the raw search pipeline feels trustworthy enough.
- Decide how Amazon vs Walmart vs broader-provider support should work by tier without making the product feel provider-specific.
- Tighten privacy/compliance language if analytics stays enabled and as affiliate behavior becomes real.
- Decide whether the product-card subtitle badge needs a more polished visual treatment later.
- Decide whether search history should stay UI-only or become real persisted history.
- Keep an eye on rate limiting / abuse protection once usage increases.

## Nice-to-have polish
- Do another small pass on result-card readability and image overlays.
- Recheck the mobile product-detail sheet behavior and CTA placement.
- Revisit the live copy so the app explains what is raw today and what will be smarter later.
- Add a clearer empty / no-good-results state.

## Filtering direction
- Rule-based filtering should clean the raw SerpApi pool first:
  - remove garbage
  - remove duplicates / near-duplicates
  - down-rank weak listings
- The backend should keep a larger cleaned candidate set for AI instead of collapsing too early to the final 4.
- The initial cleaned candidate-pool target should be 20 so we can learn from a broader set before tuning downward.
- AI should then choose the final 4 using:
  - product query
  - textarea context/details as the main fit signal
  - ratings and review counts as important quality signals
  - diversity across plausible options

## Definition of "good enough for this MVP phase"
- A user can open the live app, search for a real product need, and get 4 sensible results without errors.
- Obviously bad input is blocked with a helpful message.
- The app does not feel tied to one marketplace even if affiliate priorities differ behind the scenes.
- The deployed experience is stable enough that the next work can focus on product quality rather than infrastructure.

## Temporary-only note
- Any local cache, saved query list, or evaluation dataset used during development is temporary tooling only.
- It is not the long-term product storage model.
- Before launch or before real user history matters, this temporary data approach should be removed or replaced with the correct persistent design.
