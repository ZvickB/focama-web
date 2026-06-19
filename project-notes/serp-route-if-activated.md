# SerpApi Path — If It Gets Reactivated Later

## Current reality
- The homepage does not use a SerpApi discovery route.
- The active Render backend is centered on `GET /api/search/rainforest-discover`.
- Older scripts and tests still reference `/api/search/discover`, but that path is not part of the active product flow.

## What would need to be true before bringing Serp back
- Reintroduce and wire a real discovery route in the backend instead of assuming the old path still exists.
- Re-check normalization for Google Shopping style results:
  - no ASINs
  - different price/rating formats
  - different product IDs and clickout links
- Decide how retailer clickouts should behave when links point to Google Shopping or mixed merchants instead of Amazon product pages.
- Verify enrichment matching still works when `candidateId` is not Amazon/ASIN-shaped.
- Revisit geo and language handling for non-US markets.
- Re-add monitoring for SerpApi-specific cost, rate limits, and error behavior.

## Later price-comparison idea
- Possible narrower use: do not use SerpApi as main discovery; use it only as a lazy product-detail price check.
- During finalize/enrichment, ask AI to prepare a search-ready normalized product query field such as `comparisonSearchQuery`.
- The query should preserve identity-critical details: brand, model, product type, size/capacity/count, version/generation/year, and color/material only when it defines the item.
- The query should remove Amazon keyword stuffing, promo/deal phrases, shipping text, and duplicate descriptors.
- Later, when the user opens an eligible product modal, the backend could call SerpApi Google Shopping using `comparisonSearchQuery`.
- Initial eligibility idea: only check products with a known price over about $100, so cost/noise stays low.
- Treat the SerpApi result as advisory, not authoritative. A cheaper result still needs basic same-product checks such as brand/model/title similarity, and the UI should avoid claiming a lower price when confidence is weak.
- Prefer an on-demand endpoint such as `GET /api/product/price-check` rather than adding this to the blocking discovery/finalize path.

## Product guardrail
- Do not reactivate SerpApi just because old code or scripts still mention it.
- Bring it back only for a deliberate product reason such as:
  - multi-retailer discovery becoming part of the real product
  - Amazon coverage proving too narrow for important categories
  - Oxylabs/Rainforest economics forcing a different path
