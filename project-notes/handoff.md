# Handoff

## Purpose
- This file is the running checklist for what still needs to be done until the MVP feels complete.
- It should be more durable than `current-status.md`, which is for the immediate next step.
- Update this file whenever a meaningful chunk of work is finished or a new requirement becomes clear.

## Current reality
- The app is live on Vercel.
- The homepage uses the live `/api/search` route.
- SerpApi is wired through Vercel functions.
- Basic test coverage exists for backend behavior and homepage search flow.
- Input validation now blocks obviously low-signal queries.

## Next likely work
- Verify the live deployment end to end on desktop and mobile.
- Watch for weak-result cases and improve result-quality handling without overcomplicating the flow.
- Decide whether the next product milestone is:
  - better raw result quality and fallback handling
  - AI reranking/filtering
  - outbound retailer links

## Known remaining work
- Improve low-confidence search handling so weak or ambiguous searches get a clearer fallback instead of merely plausible results.
- Decide whether to add post-search quality checks in addition to the current pre-search validation.
- Add outbound retailer links once the raw search pipeline feels trustworthy enough.
- Add AI reranking/filtering only after the raw pipeline is stable.
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

## Definition of "good enough for this MVP phase"
- A user can open the live app, search for a real product need, and get 4 sensible results without errors.
- Obviously bad input is blocked with a helpful message.
- The app does not feel tied to one marketplace even if affiliate priorities differ behind the scenes.
- The deployed experience is stable enough that the next work can focus on product quality rather than infrastructure.
