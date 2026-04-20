# Product Data Strategy — Rainforest API & Beyond

**Date:** 2026-04-16  
**Status:** Exploring — free tier uses 1 call (basic data); subscriber tier uses `include_products_count=20` (one enriched call)

---

## Background

Focama currently uses SerpAPI (Google Shopping) as its search backend. We explored switching to RainforestAPI (Amazon) and in doing so uncovered a fundamental question: how do we get rich product data to give the AI enough context to make good selections and write meaningful fit explanations?

---

## SerpAPI vs RainforestAPI — What Each Gives You

### SerpAPI (Google Shopping)
- Multi-retailer results — Walmart, Target, Best Buy, Amazon mixed together
- ~20 results per query
- Fields: title, price (current + sale), rating, review count, retailer name, short snippet, discount tag
- No ASIN, no popularity data, no brand as separate field
- No product description at search level

### RainforestAPI (Amazon only)
- 48–70 results per query
- Fields: title, price (current + list price), rating, ratings_total, image, ASIN, recent_sales ("8K+ bought in past month"), amazons_choice badge, delivery details, is_prime
- No description, no brand, no feature bullets at search level
- `recent_sales` is a real purchase volume signal SerpAPI doesn't have
- ASIN enables clean Amazon links and downstream product detail calls

### The shared limitation
Neither API returns product descriptions or feature bullets from a basic search call alone. However Rainforest has an `include_products_count` parameter that runs product detail fetches server-side and bundles them into the search response — see strategies below.

---

## The Core Problem

RainforestAPI has two distinct endpoint types:

- **`type=search`** — scrapes the Amazon search results page. Basic data only (what you'd see in a search grid).
- **`type=product`** — scrapes the full Amazon product detail page for a single ASIN. Returns everything: brand, feature bullets, full specs table, rating breakdown, recent reviews, variants, images.

To get rich product data you would normally need a separate `type=product` call per ASIN. However Rainforest provides an `include_products_count` parameter on the search endpoint that handles this server-side — it runs product detail fetches for the top N results and bundles everything into one response. Cost is still 1 credit per product included, but it's one HTTP request instead of many.

---

## Strategies Considered

### Option 1 — Basic data only (1 call per search)
Use the search call as-is. AI selects and explains from title + price + rating + recent_sales.

- Pros: fast, simple, cheap ($0.008 per search)
- Cons: AI explanations are generic — "highly rated and popular" rather than specific fit reasons
- Verdict: viable for an early MVP but explanation quality is noticeably weaker

### Option 2 — Enrich the final 6 after selection (7 calls per search)
AI selects 6 from basic search data, then fire 6 parallel product calls, then AI writes explanations using the full feature bullets and specs.

- Pros: good explanation quality, manageable cost ($0.056 per search), feature bullets can display on cards immediately while AI writes
- Cons: adds 1–3 seconds after selection; needs timeout/fallback if a product call is slow
- Superseded for subscriber tier by Option 3b below, but still valid for a lightweight paid tier

### Option 3 — Enrich all 20 candidates before AI selection (21 separate calls)
After the search call, fire 20 parallel product calls in the background while the user is reading and answering the follow-up question. AI then selects from full data.

- Cons: server orchestrates 20 concurrent HTTP requests; one slow call can block finalize; complex error handling
- Superseded by Option 3b — same outcome, simpler implementation

### Option 3b — `include_products_count=20` (subscriber tier, preferred)
Single search call with `include_products_count=20`. Rainforest fetches product details for the top 20 results server-side and returns everything in one response. Backend dedupes and filters, AI selects the best 6 from full feature bullets and specs.

- Pros: one HTTP request, no parallel call orchestration, no per-product timeout handling, faster than 20 separate calls, best selection quality
- Cons: 20 credits per search (~$0.17); response takes longer than a basic search call since Rainforest is doing the product fetches on their end; top 20 from Amazon's ranking may include dupes — backend must dedupe before passing to AI
- **Preferred approach for subscriber tier**

### Option 4 — Middle ground: enrich top 10
Use `include_products_count=10` — halves the token load vs Option 3b, still meaningfully better than title-only selection.

- A reasonable fallback if Option 3b prompt size proves too large for the AI or response time is too slow

### Option 5 — Proactive caching with Oxylabs (long-term)
Use a nightly batch crawl to pre-fetch and cache full product details for the most commonly searched products. Marginal cost per user search approaches zero for popular items.

- **Crawl tool: Oxylabs** — ~$1.25 per 1,000 requests vs Rainforest's ~$8.30. At batch volume the cost difference is dramatic. Speed doesn't matter for an overnight job.
- **Live search tool: Rainforest** — handles cache misses and long-tail queries where Oxylabs' ~5s response time would be too slow
- Nightly job runs at low-traffic hours, crawls top N products per category, warms the cache
- AI gets full feature bullets and specs on cache hits at essentially zero marginal cost
- Not appropriate to build now — needs real usage data to know what's worth crawling

---

## Progressive Loading — UX Insight

In Option 2, the product calls fire in parallel after selection. Each one resolves independently. This means:

- Feature bullets can populate product cards **as each call returns** — no waiting for all 6
- AI is writing fit explanations in the background using those same bullets
- AI explanation is the last thing to fill in

The user sees real product content almost immediately. The AI explanation lands last, which is fine because they're already reading the bullets. This makes the wait feel productive rather than like a loading screen.

The manufacturer's bullets (factual, specific) and the AI explanation (contextual, honest caveats) serve different purposes and load independently — which is actually better UX than waiting for everything at once.

---

## Subscriber Tier Opportunity

The data enrichment gap creates a natural product tier:

| Tier | Approach | Credits | AI selects from | Explanation quality |
|------|----------|---------|-----------------|---------------------|
| Free | `type=search` only | 1 (~$0.008) | Title, price, rating, recent_sales | Good — "highly rated, fits your budget" |
| Subscriber | `type=search` + `include_products_count=20` | 20 (~$0.17) | Full feature bullets + specs for all candidates | Much better — specific fit reasons, honest caveats |

The subscriber approach is a single HTTP request — Rainforest handles the enrichment server-side. Backend dedupes the results, AI selects the best 6 from the full data pool.

Cost difference is still very manageable. At $10/month a subscriber would need ~59 searches before API cost exceeds subscription revenue — very comfortable margin.

The difference in explanation quality is visible and meaningful to users, which makes it a real reason to subscribe rather than an artificial gate.

---

## Long-Term Architecture — Official Amazon Data as the End Goal

Rainforest is a stepping stone, not the destination. But the official Amazon data path is currently in flux.

### Amazon PA API v5 — Being retired April/May 2026
Amazon Product Advertising API v5 is being shut down this month (April 30 / May 15, 2026). It is not a viable target.

### Amazon Creators API — The replacement
Amazon is replacing PA API with a new **Creators API**, accessed through Associates Central with new credentials (AWS keys no longer work). It is brand new as of early 2026, so documentation is still thin and it's unclear:
- What product data fields it exposes
- Whether it returns feature bullets and descriptions
- Whether it carries the same traffic/sales threshold requirements as PA API

**Implication for Focama:** The official Amazon data path is unstable right now. Rainforest is the more reliable choice in the short term while the Creators API matures and gets properly documented.

**Target architecture (when Creators API stabilizes):**

- **Free users** — Amazon Creators API (official data, no scraping cost)
- **Subscribers** — Rainforest enrichment on top, full feature bullets and specs
- **Migration path** — once Creators API data quality is confirmed, migrate free tier off Rainforest without touching the subscriber path

Until then, Rainforest carries the full load for both tiers.

---

## Amazon Data Provider Landscape

| Provider | Type | Price per 1K requests | Speed | Best for |
|----------|------|-----------------------|-------|----------|
| Rainforest API | Amazon scraper | ~$8.30 | Fast (~1-2s) | Live user searches, early stage |
| Oxylabs | Amazon scraper | ~$1.25 | Slow (~5s) | Nightly batch crawls, high volume |
| Amazon Creators API | Official affiliate API | Unknown | Unknown | Content creators / influencers — wrong tool for Focama |

### Creators API — worth investigating when traffic arrives
Amazon's official API was retooled in 2026 for influencers and affiliate content creators. The focus appears to be on affiliate tracking and deals, but the full data surface isn't well documented yet — it's possible product data fields are still exposed. Requires 10 qualified sales per 30 days to maintain access, which is a natural milestone anyway if the product is working. Worth revisiting once Focama has real traffic and the Creators API documentation matures.

### Why not Oxylabs for live search
~5 second response time is too slow for a user waiting on results. Fine for background jobs where nobody is watching.

### The right split by use case
- **Live search** → Rainforest (fast, reliable, acceptable cost at early-stage volume)
- **Nightly cache warm** → Oxylabs (slow is fine, cost savings are significant at batch scale)
- **Revisit** → when daily search volume is high enough that Rainforest live-search costs become meaningful

## Open Questions

- Does selection quality from basic data hold up across diverse query types, or are there categories where title-only selection produces noticeably bad picks? (Worth testing with real users)
- At what traffic level does proactive caching become worth building?
- Does enriching top 10 vs top 6 meaningfully improve selection quality? (Testable with a small experiment)
- Timeout threshold for product calls — what's the right cutoff before falling back to basic data for a card?
