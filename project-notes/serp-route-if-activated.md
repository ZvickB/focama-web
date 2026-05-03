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

## Product guardrail
- Do not reactivate SerpApi just because old code or scripts still mention it.
- Bring it back only for a deliberate product reason such as:
  - multi-retailer discovery becoming part of the real product
  - Amazon coverage proving too narrow for important categories
  - Oxylabs/Rainforest economics forcing a different path
