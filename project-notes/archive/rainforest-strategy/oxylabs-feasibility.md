# Oxylabs Feasibility Test — Results & Next Steps

**Date:** 2026-04-19  
**Branch:** feature/rainforest-dual-endpoint  
**Status:** Normalizers written — product detail enrichment not yet wired in (planned for Codex)

---

## Background

The goal is to test whether Oxylabs can substitute for Rainforest's `type=product` call
during development, so we can build and test the dual-endpoint enrichment flow cheaply
before committing to Rainforest's per-credit cost closer to launch.

Rainforest `type=product` costs ~1 credit (~$0.008) per ASIN. Oxylabs is ~$1.25/1K
requests — significantly cheaper for testing at volume.

---

## What Was Tested

Script: `backend/scripts/test-oxylabs.js`  
Samples saved to: `temp-data/oxylabs-samples/`

Two call types tested:
- `amazon_search` — query: "office chair" — compared against `temp-data/rainforest-samples/office_chair.json`
- `amazon_product` — ASIN `B0C4JTPPYY` (desk lamp) — compared against `temp-data/rainforest-product-samples/B0C4JTPPYY.json`

Oxylabs credentials use HTTP Basic Auth (username with suffix + password), stored in `.env`
as `OXYLABS_USERNAME` / `OXYLABS_PASSWORD`.

---

## Search Call Results (`amazon_search`)

| Field | Status | Notes |
|-------|--------|-------|
| title | ✓ | Matches |
| asin | ✓ | Matches |
| price | ✓ | Matches |
| rating | ✓ | Matches |
| image | ✓ | Matches |
| link | ✓ | Oxylabs returns relative path, not full URL — needs a `https://amazon.com` prefix |
| recent_sales | ✓ | Minor wording diff ("10K+" vs "9K+") — different scrape time, not a bug |
| is_prime | ✓ | Matches |
| amazons_choice | ✓ | Oxylabs returns `true`/`false` boolean; Rainforest returns an object with link and badge text — shape differs but data is there |
| ratings_total | ✗ | Not found under expected key — Oxylabs has `reviews_count`, likely the same data, not yet verified |

Both APIs returned 48 results. Response time: ~3.6s.

---

## Product Detail Call Results (`amazon_product`)

| Field | Status | Notes |
|-------|--------|-------|
| title | ✓ | Matches |
| brand | ✓ | Matches |
| asin | ✓ | Matches |
| price | ✓ | Oxylabs returns a plain number; Rainforest returns an object `{symbol, value, raw}` — easy to normalize |
| rating | ✓ | Matches |
| main_image | ✓ | Same image, slightly different URL suffix (`_AC_SL1500_` vs none) — same image |
| feature_bullets | ✓ | Present as `bullet_points` (different key name). Same content as Rainforest. Delivered as one newline-separated string instead of an array — needs `.split('\n')` |
| specifications | ✓ | Present as `product_details` object. Shape differs from Rainforest's array of `{name, value}` — needs normalization |
| description | ✓ | Present (Rainforest had this as MISSING for this product — Oxylabs actually better here) |
| ratings_total | ✗ | Not found under expected key — `reviews_count` likely equivalent, not yet verified |
| categories | ✗ | Rainforest returns array; Oxylabs has `category` (singular string) — shape differs, not yet verified |

Response time: ~3.6s (same ballpark as Rainforest).

---

## Key Finding

**Oxylabs can do the job.** The critical enrichment fields — `bullet_points` (feature bullets),
`brand`, `product_details` (specs), `description` — are all present and match Rainforest content.
The gaps are minor shape differences, not missing data.

---

## Gaps Resolved

All three gaps were resolved by inspecting `temp-data/oxylabs-samples/` — no new API calls needed:

1. **`reviews_count`** — confirmed equivalent to `ratings_total` (e.g. `7448`)
2. **`category`** — returns `[{ ladder: [{name, url}, ...] }]` — normalized to array of name strings via `category[0].ladder.map(c => c.name)`
3. **`link` / `url`** — confirmed relative path, needs `https://www.amazon.com` prefix

---

## What's Done

- `backend/lib/oxylabs-normalizer.js` written and smoke-tested against real samples
  - `normalizeOxylabsSearchResult()` — drop-in replacement for `normalizeRainforestItem()` output shape
  - `normalizeOxylabsProduct()` — maps `amazon_product` detail response for future enrichment use

## Remaining — Planned for Codex

1. **Wire `normalizeOxylabsSearchResult` into the search path** — use it instead of (or alongside) the Rainforest search call
2. **Product detail enrichment** — after finalize selects 6 ASINs, fire 6 parallel Oxylabs `amazon_product` calls, pass `feature_bullets` to the AI prompt for richer fit reasons
3. **Show bullets in the product modal** — the modal currently has no section for bullet points; needs a new UI section added to `ProductDetailModal` in `HomeShared.jsx`
4. **Test full enrichment flow** end-to-end
5. **When closer to launch** — compare Oxylabs vs Rainforest `type=product` output quality; Oxylabs may stay long-term (~6x cheaper)

---

## Cost Reference

| Provider | Per call | 6 product calls per search |
|----------|----------|---------------------------|
| Rainforest `type=product` | ~$0.008 | ~$0.048 |
| Oxylabs `amazon_product` | ~$0.00125 | ~$0.0075 |

Oxylabs is ~6x cheaper per product call. Fine for testing; possibly fine for production too.
