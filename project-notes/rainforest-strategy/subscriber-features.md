# Subscriber Features — Planned

Features reserved for paying subscribers. Not scheduled for immediate implementation — this is a planning list for future roadmap.

---

## Data & AI Quality

- **Enriched product results** — single search call with `include_products_count=20`. Rainforest fetches full product details (feature bullets, specs, rating breakdown) for the top 20 results server-side and returns everything in one response. Backend dedupes, AI selects the best 6 from the full data pool. Meaningfully better selection quality and explanation quality than the free tier. Faster and simpler than making 20 separate product calls.
- **Progressive card loading** — feature bullets are already in the response when cards are shown. User reads real product content while the AI is still writing fit explanations.

## UX

- **Swap a card** — if a pick isn't right, swap it for the next best candidate from the existing pool without re-running the search.
- **Share results** — shareable link for a result set. Send 6 picks to someone else.

---

## Notes

- Free tier uses basic search data only (title, price, rating, recent_sales) — good enough for selection, weaker on explanation detail
- Subscriber tier justifies itself through visibly better AI explanations — specific fit reasons and honest caveats vs generic ones
- All features here should feel like a natural upgrade, not an artificial gate
