# Deep Dive Feature

## Status

- Implemented behind `DEEP_DIVE_ENABLED`.
- Account-gated through Supabase bearer-token verification.
- Lives inside the finalized product modal; no shortlist badge or automatic background comparison.
- Amazon remains the primary bottom CTA. Deep Dive is an optional research panel, not a replacement shopping path.
- Serper, Google Light, Google Custom Search, and automatic hybrid price-intel are not wired into this path.

## What it is

A user-triggered action on any product in the shortlist that shows:
1. Multi-store price comparison (table/infographic)
2. One AI-synthesized review paragraph (Haiku), citing real sources only
3. Real review highlights and critic scores when available

## How it works

### Trigger
User taps a "Deep dive" button in the product modal after finalize. No automatic background work - only fires when requested.

### Data flow
1. **SerpApi Google Shopping** — one call using the product title/identity. Finds the product group and returns an Immersive token. (1 credit)
2. **SerpApi Immersive Product** — one call with `more_stores=true`. Returns up to 13 store offers with direct merchant URLs, user reviews, top insights, critic ratings, specs, star distribution. (1 credit)
3. **Haiku review synthesis** — one call. Input: the raw user reviews, critic ratings, and top insights from step 2. Output: one paragraph summarizing what reviewers say, citing sources by name. No hallucination — if the data is thin, the paragraph is short.

**Total cost per deep dive: 2 SerpApi credits + 1 Haiku call.**

### What the user sees

**Price comparison section:**
- Store name, price, and direct link for each offer
- Highlight the lowest price and savings vs the Amazon price they're already looking at
- Show currency, condition (new/refurb), and shipping when available

**Review synthesis:**
- One paragraph, written by Haiku, that distills the real reviews
- Must cite source names (e.g., "TechRadar notes...", "Best Buy reviewers mention...")
- Must not add claims not present in the input data
- If only 1-2 reviews exist, keep it to 1-2 sentences — don't pad
- No opinion on whether the user should buy. Just what reviewers say.

**Supporting data (if available):**
- Critic ratings with source names and scores
- Star distribution breakdown
- Top insight tags (e.g., "Sound Quality", "Battery Life", "Fit")

### What it does NOT do
- No automatic background runs — only on user action
- No card badge or indicator on the shortlist
- No "you need this" pressure — it's an optional extra
- No AI opinion beyond summarizing real reviews
- No product recommendations or upsells
- No price-drop notification scheduling in v1

## Subscription gate

- First account Deep Dive is free while payment is absent.
- Subsequent Deep Dives return a gated state with tester-oriented unlock copy.
- Real subscription/payment tables and Stripe flows are deferred.

## Haiku prompt guardrails

- System: "You are summarizing real product reviews. Only state what the provided reviews say. Cite the source name for each claim. Do not add your own opinions or information not in the input. If the data is limited, write less."
- Input: structured JSON of user_reviews, critic_ratings, top_insights from Immersive response
- Output: one paragraph, plain text, no markdown

## Pipeline simplification

The existing Serper-based discovery layer is not needed for this flow. The deep dive path is:
- SerpApi Shopping → Immersive Product → Haiku synthesis
- No Serper calls
- The existing Immersive store normalization, retailer-link-validation, and exact-product-proof logic from the hybrid pipeline can be reused for URL safety checks

## Open questions

1. **Subscription model:** Monthly? Per-deep-dive credits? Price point?
2. **Free tier limit:** Current implementation is one lifetime free per account; confirm before public rollout.
3. **Market scope:** Current implementation is US/CA only; expand only after live review.
4. **Live-review quality:** Validate at least 20 US/CA Deep Dives before hardening paid gating.
