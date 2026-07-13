# Compare Prices (formerly Deep Dive)

## Status

- 2026-07-08: The feature was narrowed to **price comparison only** and renamed "Compare prices" in all user-facing copy. Review synthesis, critic ratings, top insights, and star distribution were removed from the backend payload and the modal UI. The user could not get the review side to work effectively, and the deep research ambition now belongs to the separate Premium Research Report pre-plan (`Focamai_Premium_Research_Report_Master_Plan.md`).
- Internal naming intentionally keeps Deep Dive: route `POST /api/product/deep-dive`, `DEEP_DIVE_*` env vars, `deep_dive_*` cache keys/tables, and `deepDive*` code identifiers. Only user-visible strings say "Compare prices" / "price comparison".
- Implemented behind `DEEP_DIVE_ENABLED`, account-gated through Supabase bearer-token verification.
- Lives inside the finalized product modal; no shortlist badge or automatic background comparison. Amazon remains the primary bottom CTA.

## What it is

A user-triggered action on any eligible product in the shortlist that shows a multi-store price comparison: verified lower offers from trusted retailers, or an honest "No lower price found" confirmation.

## How it works

### Trigger
User taps `Compare prices at other stores` in the product modal after finalize. The button is hidden by default and appears only after mini writeup when a **deterministic prefilter** marks the product `show` (price >= $75, not accessory/replacement/consumable-pattern title, and brand/model/review-count identity signal). The former `gpt-5-mini` eligibility pass was removed 2026-07-08 — eligibility is now deterministic only and costs nothing. Eligibility only controls button visibility.

### Data flow
1. **SerpApi Google Shopping** — one call using the product title/identity. Finds the product group and returns an Immersive token. (1 credit)
2. **SerpApi Immersive Product** — one call with `more_stores=true`. Returns up to 13 store offers with direct merchant URLs. (1 credit)

**Total cost per comparison: 2 SerpApi credits. No AI calls.**

### What the user sees
- Store name, price, and direct link for each **lower verified** offer when the Amazon/source price is known
- Savings vs the Amazon price they're already looking at, plus currency/condition/shipping when available
- A **"No lower price found"** confirmation card (with `checkedStoreCount`) when nothing verified beats the Amazon/source price — a positive answer, not a failure state
- CA sessions with zero lower offers can optionally load US retailer prices (costs 2 extra credits)
- If a stale Immersive cache cannot be refreshed, the response is a `limited` `price_data_stale` state instead of stale prices

### What it does NOT do
- No review content of any kind (removed 2026-07-08)
- No automatic background runs — only on user action
- No card badge or indicator on the shortlist
- No "you need this" pressure — it's an optional extra
- No price-drop notification scheduling (Price Watch is the separate feature for that)

## Matching behavior (unchanged)

- **Layer A (Shopping product group selection):** Identity scoring picks the best Google Shopping result. Same-model ties resolve to the first result. Cross-family ties pick the top result with an `ambiguous` flag so the frontend can warn the user.
- **Layer B (per-store offer proof):** Hard failures (marketplace label, accessory title, condition conflict, brand missing) reject the offer. Soft failures (model, capacity, generation, feature/display tier, insufficient identity) accept the offer with user-facing caveats describing what could not be confirmed.

## Gating

- Account-gated (Supabase sign-in required). The per-account usage gate is commented out during testing — re-enable after testers confirm quality.
- Subscriber-style auth metadata and `DEEP_DIVE_SUBSCRIBER_EMAILS` / `DEEP_DIVE_SUBSCRIBER_USER_IDS` env allowlists grant unlimited use; `DEEP_DIVE_FREE_LIMIT` caps others when the gate is active.
- Real subscription/payment flows remain deferred.

## Open questions

1. **Gating shape once stable:** price comparison feels closer to table-stakes than the old Deep Dive concept — revisit whether it stays flagged/tester-gated or becomes a normal modal feature.
2. **Market scope:** current implementation is US/CA only; expand only after live review.
3. **Live-review quality:** validate at least 20 US/CA comparisons before hardening paid gating.
4. **Unknown source price behavior:** if the source product has no comparable price, v1 may still show exact verified alternate offers because there is no honest lower-price baseline.
5. **CA→US fallback cost:** the "Show US retailer prices" fallback costs 2 extra SerpApi credits. Rethink whether this is worth it.
