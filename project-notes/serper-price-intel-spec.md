# Hybrid Price Intelligence — Implemented Experiment

## Status

- Implemented on `experiment/serp-price-intel`; disabled by default with `HYBRID_PRICE_INTEL_MODE=off`.
- The retired `SERPER_PRICE_INTEL_ENABLED` flag no longer starts automatic work.
- The separate manual `PRICE_COMPARISON_ENABLED` SerpApi/BlueCart endpoint remains disabled and isolated.
- Initial automatic scope is the hero/top finalized recommendation only, for Amazon Canada/CAD and Amazon US/USD.
- No comparison card badge exists. The only user-facing surface remains the quiet modal panel above the existing Amazon CTA.
- A post-implementation Canadian shadow replay on 2026-06-22 completed 7/8 preserved cases, timed out safely on one, and verified zero offers. Shopping was often ambiguous or Immersive returned only one store that did not map back to the Serper candidate. No unsafe/uncertain comparison passed. The generated local report is `temp-data/price-intel-reviews/hybrid-live-review-latest.json`; keep the feature off while coverage is investigated.

## Request flow

1. Finalize returns the six-product shortlist without waiting for price intelligence.
2. If the hero exceeds `PRICE_CHECK_THRESHOLD`, required keys and the market allowlist exist, and mode is `shadow` or `surface`, one cached Serper Shopping request starts alongside product-detail/enrichment work.
3. After enrichment supplies normalized identity, deterministic gates retain at most three promising non-Amazon, non-marketplace, new-condition offers with matching currency and plausible savings.
4. Only when a promising Serper signal survives, one SerpApi Google Shopping request searches the canonical source identity. A unique exact product group with an Immersive token is required.
5. One SerpApi Immersive Product request uses `more_stores=true`. There is no pagination.
6. Serper and SerpApi IDs are never treated as interchangeable. A Serper candidate maps to an Immersive store only through retailer identity, currency, title compatibility, and price proximity (`max($2, 2%)`).
7. Deterministic proof requires the same brand/model plus every source-visible distinguishing attribute, including generation, feature tier, size, capacity, pack count, color, condition, or edition. Missing proof rejects; multi-variant ambiguity rejects unless the selected variant proves the quoted offer.
8. Haiku can reject or classify semantic equivalence after deterministic proof, but cannot override missing/conflicting evidence or authorize surfacing by itself.
9. The direct store URL must be HTTPS, match an explicitly allowed retailer domain and retailer name, resolve only to public IPs, and survive a bounded GET/redirect probe without leaving that retailer domain. Google, SerpApi, Amazon, short/intermediary, blocked, or unreachable destinations reject.
10. Price and savings are recalculated from the Immersive store offer. The selection is checked again for staleness before a result is stored or emitted.

## Failure and visibility behavior

- All work is asynchronous and isolated from finalize and mini enrichment.
- Provider errors, timeouts, ambiguity, missing variants, failed probes, exhausted budgets, and stale selections fail silently in the product UI.
- `shadow` runs verification and measurement but never stores/emits a client result.
- `surface` still requires `PRICE_INTEL_SURFACE_PERCENT > 0`; rollout assignment is deterministic by discovery token.
- SSE waits only in active surface mode. Polling preserves the same `priceComparison.results` payload.
- The modal repeats basic HTTPS, savings, same-retailer, Amazon, Google, and SerpApi rejection as a final client safeguard.

## Cache and budgets

- Serper results: 30 minutes; empty results: 15 minutes.
- SerpApi Shopping and Immersive price/link data: 30 minutes; empty results: 15 minutes; provider errors: 5 minutes.
- Semantic identity judgment: 7 days, keyed without price or URL so price refreshes do not force another AI call.
- Strategy versions, source identity, market, and allowlist version participate in cache keys.
- Maximum per search: one Serper request, one Shopping request, one Immersive request, one Haiku judgment, and one direct-link probe.
- Default SerpApi controls: 32 calls/day, 4 calls/minute, one active verification job per process. Cached provider results do not reserve call budget.
- SerpApi cost buckets request fail-closed shared rate limiting when Supabase rate storage is configured; an outage cannot silently fall back to spending through a process-local bucket. The live-review command deliberately uses isolated memory limits.
- Measurement logs record candidate rejection reasons, provider cache states, budgets, Shopping ambiguity, Immersive coverage, exact-proof evidence, AI cache/use, direct-link validation, call count, estimated SerpApi cost, latency, and final shadow/surface outcome.

## Configuration

```text
HYBRID_PRICE_INTEL_MODE=off
SERPER_API_KEY=
SERPAPI_API_KEY=
CLAUDE_API_KEY=
PRICE_INTEL_ALLOWED_DOMAINS_CA=
PRICE_INTEL_ALLOWED_DOMAINS_US=
PRICE_INTEL_ALLOWLIST_VERSION=1
PRICE_INTEL_SURFACE_PERCENT=0
PRICE_CHECK_THRESHOLD=100
PRICE_MATCH_MIN_SAVINGS=8
PRICE_MATCH_MIN_PERCENT=0.08
PRICE_MATCH_MAX_PERCENT=0.60
PRICE_MATCH_CONFIDENCE=0.85
SERPER_PRICE_INTEL_MAX_OFFERS=3
SERPER_PRICE_INTEL_RATE_LIMIT_PER_MINUTE=30
SERPAPI_PRICE_INTEL_DAILY_CALLS=32
SERPAPI_PRICE_INTEL_CALLS_PER_MINUTE=4
SERPAPI_PRICE_INTEL_MAX_CONCURRENCY=1
```

Allowlist values are explicit deployment decisions. `.env.example` contains review seeds, not a claim that every retailer is approved for production.

## Rollout gate

1. Run local/live shadow review for the preserved 2026-06-22 Canadian cases and equivalent US cases.
2. Manually inspect at least 50 verification survivors.
3. Require zero identity/variant mismatches, zero intermediary/Amazon links, approved final domains only, no finalize/enrichment regression, and no search above the one-Serper/two-SerpApi cap.
4. Set a small nonzero surface percentage only after those gates pass.
5. Audit the first 25 surfaced links. Any false positive returns the feature to shadow and increments the relevant strategy version.

The preserved pre-hybrid evidence remains in `temp-data/price-intel-reviews/serper-live-review-2026-06-22.md` and `.json`.
