# Price Comparison Phase 0 Spike

**Run date:** June 14, 2026  
**Market:** Canada (`amazon.ca`, Google Shopping `gl=ca`, CAD)  
**Sample:** 20 Amazon Canada products across appliances, kitchen tools, toys, electronics, phone accessories, office supplies, household products, and apparel

## Executive conclusion

Proceed to Phase 1: async display-title and comparison-identity normalization.

The provider data is strong enough to build a useful structured identity for many products. Rainforest product detail was the strongest source: all 20 products had a brand, 18 had model information, 12 had UPC values, and 17 had useful size/capacity/count fields.

Do not proceed directly to user-facing comparison yet. Google Shopping has broad Canadian retailer coverage, but the first response alone is not reliable enough to enforce exact variants, condition, shipping totals, or retailer-direct seller rules. The deeper Immersive Product call supplies direct store links and better totals.

A follow-up BlueCart API spike resolved the Walmart seller-identity gap. BlueCart exposes whether an offer is a marketplace item and returns the actual seller name and ID. It should be used as a Walmart-specific search/verification source rather than treating all SerpApi `Walmart.ca` rows as retailer-direct.

## What was tested

- 20 Rainforest `type=product` calls for Amazon Canada
- 20 Oxylabs `amazon_product` calls with domain `ca`
- 20 SerpApi Google Shopping title queries for Canada
- 5 additional compact brand/model or product-code queries
- 3 SerpApi Immersive Product calls for representative Walmart and Best Buy offers
- 20 BlueCart Walmart Canada searches using the same product sample

The original 68 provider calls completed successfully. BlueCart completed all 20 sampled searches after one uncharged transient retry.

Raw responses and the machine-readable summary are saved under:

```text
temp-data/price-comparison-phase0/
```

This folder and this note are intentionally gitignored research artifacts.

## Product-detail identifier coverage

| Field | Rainforest | Oxylabs |
|---|---:|---:|
| Successful product payload | 20/20 | 20/20 |
| Brand | 20/20 (100%) | 20/20 (100%) |
| Model or manufacturer part field | 18/20 (90%) | 18/20 (90%) |
| UPC | 12/20 (60%) | 5/20 (25%) |
| GTIN | 11/20 (55%) | 0/20 |
| Useful size/capacity/count field | 17/20 (85%) | 10/20 (50%) |

Notes:

- Rainforest's GTIN values generally duplicated its UPC values; they are useful but not independent evidence.
- Model numbers were especially useful for appliances, LEGO sets, office products, and accessories.
- UPC/GTIN coverage was weak for Apple products, phone cases, and several apparel products.
- Oxylabs remains useful as a fallback, but Rainforest exposed substantially more matching-ready identifiers in this sample.
- Provider metadata is not automatically trustworthy merely because a field exists. The AirPods 4 Rainforest payload included an apparent AirPods Max size/weight block, showing that unrelated or variant-level specifications can leak into product detail.

## Canadian Google Shopping coverage

Across the 20 title searches:

- 20/20 returned priced Shopping results.
- 480 Shopping rows were returned in total.
- 323 rows were from sources not named Amazon.
- 19/20 products had at least one non-Amazon row.
- 12/20 products had at least one Walmart.ca row.
- 240/480 rows contained some delivery/shipping text.
- Every row had a source name and numeric price.

Frequently returned sources included:

- Amazon CA: 127 rows
- Walmart.ca: 40
- Best Buy Canada Marketplace: 20
- eBay: 19
- Staples Canada: 8
- Best Buy Canada: 7
- Cuisinart Canada: 5
- SharkNinja Canada: 3
- LEGO.com: 3

Coverage is not the same as usable exact matches. Many result sets mixed:

- nearby models and generations
- accessories and replacement parts
- different capacities or pack counts
- open-box and refurbished items
- direct retailers and marketplace sellers
- cross-border or questionable sources

Examples:

- An `INKBIRD ISV-100W` search returned ISV-200W and ISV-101W offers near the top.
- An AirPods 4 search returned replacement charging cases and refurbished marketplace listings.
- A LEGO 10698 search returned the exact set, a smaller 10696 set, and instruction manuals.
- Windex searches mixed 765 mL bottles, 2 L and 5 L refills, multipacks, and other formulas.

## Compact query experiment

Five shorter identifier-oriented queries were tested:

- `Cuisinart ICE-21C`
- `Ninja CREAMi NC301C`
- `INKBIRD ISV-100W`
- `LEGO 10696`
- `Windex 059200004936`

Results were mixed:

- LEGO and INKBIRD model queries produced several clearly model-matching rows.
- Cuisinart and Ninja still produced grouped or generic listings where the exact model was omitted from retailer titles.
- The Windex UPC query produced broad Windex results rather than isolating the exact 765 mL item.

Conclusion: compact normalized queries are worthwhile, but a model number or UPC in the query does not guarantee exact-result titles. Structured compatibility checks remain necessary.

## Shipping, condition, and clickout findings

The first Google Shopping response is insufficient by itself for the planned feature.

### Condition

- Only 4 of 480 top-level rows exposed a recognized condition field or obvious condition signal in the current analyzer.
- Several additional listings contained condition language such as `Openbox`, `Refurbished`, or French `Remis à neuf` in titles.
- Most importantly, a top-level Walmart result titled simply `Apple AirPods 4` resolved through the Immersive Product response to an `Openbox` Walmart listing.

Condition filtering must therefore inspect both top-level and deeper offer data. A clean-looking top-level title cannot be trusted as proof of new condition.

### Shipping and totals

- Top-level delivery text was available for about half the rows.
- The Immersive Product response provided structured store price, shipping, and total fields when Google had them.
- Shipping data can be erroneous or commercially implausible. One Best Buy Marketplace result reported `$999` delivery, so sanity validation is required.

### Direct clickout links

- Top-level `product_link` values pointed to Google Shopping pages rather than directly to the retailer.
- Immersive Product `stores` entries supplied direct retailer URLs.
- This makes a second SerpApi call necessary when the product is not already cached and Focamai needs a direct clickout, shipping total, or deeper condition information.

## Major-retailer seller classification

SerpApi can distinguish some marketplace sources directly, such as:

```text
Best Buy Canada Marketplace
Best Buy Canada
```

SerpApi alone leaves Walmart unresolved:

- Walmart Immersive Product links included a `selectedSellerId`.
- The response did not provide the corresponding seller name or a reliable `sold by Walmart` field.
- Some Walmart prices and titles strongly appeared to be marketplace/open-box offers despite the source being only `Walmart.ca`.

Therefore the confirmed `Major retailers only` rule cannot safely treat every SerpApi `Walmart.ca` result as retailer-direct.

### BlueCart follow-up result

BlueCart's Walmart Canada search response directly provides:

- `offers.is_marketplace_item`
- primary seller name and seller ID
- direct Walmart.ca product URL
- item ID
- price and inventory
- shipping/pickup availability booleans

The AirPods example confirmed the distinction:

- New AirPods 4 at $144: `is_marketplace_item=false`, seller `Walmart`
- Open-box AirPods 4 at $134.49: `is_marketplace_item=true`, seller `Cellulartech`
- Refurbished AirPods 4 at $118.40: marketplace seller `DealWiz`

Across the 20-product BlueCart search sample:

- 453 Walmart.ca rows were returned.
- 104 were Walmart-direct.
- 349 were marketplace offers.
- 15/20 product searches returned at least one Walmart-direct row.
- 18/20 returned at least one marketplace row.
- 17 rows contained obvious refurbished/open-box condition language.

BlueCart search remains noisy. Exact products were easy to identify for products such as LEGO 10696/10698 and some model-number appliances, while generic accessories, apparel, and office products returned many related but non-identical products. Some prices were zero, and `condition=new` did not prevent refurbished/open-box rows from appearing. Focamai must still apply its own condition, positive-price, model, size, capacity, and pack-count filters.

Recommended provider roles:

- SerpApi: broad multi-retailer candidate discovery.
- BlueCart: Walmart.ca search and authoritative Walmart-direct/marketplace seller classification.
- BlueCart product detail: use selectively after a Walmart candidate is matched and localized detail is needed; Walmart Canada product requests require a configured store ID.

This removes the Walmart seller-classification blocker, provided BlueCart remains available and its free/paid economics are acceptable.

Do not silently classify all Walmart.ca results as sold by Walmart.

## SerpApi plan and request economics

The configured account reported:

```text
Plan: Free Plan
Monthly searches: 250
Usage after this spike: 28
Remaining: 222
```

The 28 counted searches were:

- 20 title searches
- 5 compact-query searches
- 3 Immersive Product searches

SerpApi documents that identical cached searches within its cache period are free, but a normal uncached comparison will likely need:

1. one Google Shopping search
2. one Immersive Product search for direct stores, totals, and condition verification

At roughly two searches per uncached product check, the current free plan supports at most about 125 checks per month before considering QA, retries, or other SerpApi usage. It is enough for development, not broad release.

### BlueCart account

The configured BlueCart account reported:

```text
Plan: Free
Monthly credits: 100
Used after the spike: 21
Remaining: 79
Reset: July 14, 2026
```

BlueCart search used one credit per successful request. One transient failure explicitly stated that it was not charged. The free tier is enough for development and limited testing, not broad production traffic.

## Walmart Canada affiliate correction

Walmart Canada's official affiliate page says its program uses **Rakuten Advertising**, not Impact. After creating a Rakuten publisher account, the publisher searches for and applies to the Walmart Canada program. Approved publishers can generate deep links.

This roadmap should not create Impact-specific configuration for Walmart Canada.

Official source:

- [Walmart Canada Affiliate Program](https://www.walmart.ca/en/cp/affiliate-program/6000208941216)

## Recommendations for Phase 1

1. Proceed with async `sourceTitle`, `displayTitle`, and `matchIdentifier` generation.
2. Seed structured identity from Rainforest provider fields before asking AI to normalize descriptive fields.
3. Preserve provider-field provenance and never let AI invent UPC/GTIN values.
4. Treat missing compatibility data as uncertainty and explicit conflicts as rejection.
5. Validate provider attributes against the source title because provider detail can contain variant contamination.
6. Keep comparison lookup lazy on modal open as planned.
7. Assume the eventual uncached lookup may require two SerpApi calls, not one.
8. Use BlueCart seller metadata to implement Walmart's `Major retailers only` rule; do not infer retailer-direct status from the SerpApi source label alone.
9. Keep match-quality measurement and manual accepted/rejected review deferred, per the current product decision.

## Phase 1 implementation addendum

Phase 1 was implemented on June 15, 2026. Provider identity is now carried through fresh Rainforest/Oxylabs detail responses into the existing async mini-enrichment request. The model schema excludes UPC, EAN, and GTIN fields; trusted codes are merged after model output, and title-critical model/generation/size/capacity/pack-count details are validated before accepting a cleaned title.

The existing Supabase product-detail cache schema does not have identity columns. This does not block Phase 1 because token-scoped enrichment stores the final normalization and cached detail hits fall back safely, but Phase 2 should decide whether authoritative provider identity must also persist in the shared per-ASIN cache.

## Phase 0 acceptance status

- Provider identifier availability measured: **complete**
- Canadian title-query retailer coverage measured: **complete**
- Walmart offer frequency measured: **complete**
- Shipping and condition field behavior sampled: **complete**
- SerpApi plan capacity confirmed: **complete**
- Walmart seller classification tested with BlueCart: **complete; viable with provider-side marketplace and seller fields**
- Walmart Canada affiliate route identified: **complete; Rakuten signup/application remains a user action**
- Technical recommendation: **proceed to Phase 1; use SerpApi for broad discovery and BlueCart for Walmart verification**

## References

- [SerpApi Google Shopping API](https://serpapi.com/google-shopping-api)
- [SerpApi Google Shopping result fields](https://serpapi.com/shopping-results)
- [SerpApi Google Immersive Product API](https://serpapi.com/google-immersive-product-api)
- [BlueCart Walmart Product Data API](https://docs.trajectdata.com/bluecartapi/walmart-product-data-api/overview)
- [Walmart Canada Affiliate Program](https://www.walmart.ca/en/cp/affiliate-program/6000208941216)
