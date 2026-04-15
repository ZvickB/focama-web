# Finalize Strategy

## Purpose
- Canonical decision memo for finalize strategy, AI scope, and hard guardrails.
- Use `active-experiment-override.md` for the current prewarm/finalize experiment when it conflicts with older guardrails.
- Use `layered-latency-plan.md` for the preferred next latency architecture.
- If a future assistant wants to change the current product flow or these guardrails, it must stop and ask for permission first unless an active override explicitly covers that work.

## Problem
- The current guided product flow remains the intended product path:
  - `/api/search/discover`
  - `/api/search/refine`
  - `/api/search/finalize`
- The flow itself is not the problem; finalize latency and blocking AI scope are the problem.
- Earlier nearby experiments showed:
  - prompt slimming helped somewhat
  - compact shard scoring regressed latency and token usage
  - overly thin candidate minimization hurt shortlist quality
- Do not keep repeating variants of the same heavy finalize pattern without checking whether they fit the product goal.

## Product goal
- Focamai should feel like a calm, focused shopping guide, not a slow deep-evaluation analyst or marketplace clone.
- The app should be search-first, mobile-first, focused, and faster than heavy finalize behavior.
- For v1, perceived speed is primary: showing a trustworthy shortlist sooner matters more than waiting for complete polish before anything appears.

## Working conclusion
- AI should remain part of Focamai.
- AI should not own the heaviest possible ranking and explanation workflow on every search.
- Move toward a hybrid v1:
  - use AI where it improves interpretation and narrowing
  - narrow AI's critical-path responsibilities
  - let deterministic backend/frontend logic own structure, guardrails, fallback behavior, and cheap presentation defaults

## AI should help with
- Understanding what the user really wants.
- Turning vague or nuanced input into stronger shopping context.
- Improving narrowing beyond raw search keywords.
- Making shortlist quality feel more tailored than marketplace results.
- Surfacing concise fit/caution guidance when it materially helps.

## AI should not be expected to
- Own the heaviest possible final ranking process on every query.
- Expand into more orchestration, persistence, or polling in the default flow.
- Generate large amounts of structured polish before results can appear.
- Absorb work deterministic backend/frontend logic can do more cheaply.

## Must preserve
- Results should still feel interpreted for the user's stated need.
- The user should still see why a result is good for what they want.
- Meaningful caution/downside value should remain somewhere in the product experience.
- Scan-friendly badges should remain because they help comparison.
- The valuable part is not "lots of AI text"; it is the feeling that Focamai understands the user and explains the shortlist clearly.

## What likely changes
- Finalize should not keep doing all of this at full weight in one blocking step:
  - deep comparative ranking
  - shortlist selection
  - rich rationale generation
  - drawback generation
  - badge generation with bespoke badge reasons
- Keep shortlist quality, concise fit/caution value, and badges, but reduce how much expensive AI work blocks first results.

## Badge strategy
- Badges are still product value.
- The direction is "keep badges, make them cheaper."
- Strong v1 direction:
  - AI helps choose the shortlist
  - deterministic app logic assigns badges after selection using structured signals and clear rules
  - AI badge reasons should not be critical-path work unless the user explicitly approves that tradeoff

## Explanation strategy
- "Why this is good or bad for what you want" is core.
- Preserving that feature does not require preserving the old heavy finalize output contract.
- Possible lighter shapes:
  - shorter fit lines
  - shorter caution lines
  - richer explanation for only top result/top few
  - more reuse of deterministic/backend signals
  - later enrichment that explains locked picks without re-ranking them

## V1 ownership split
- Discovery builds and caches the candidate pool.
- Refine stays lightweight and search-context focused.
- Blocking finalize should choose the shortlist, apply live query context/follow-up/retry feedback, and return enough shortlist-safe data to show results.
- Badge polish, richer explanation polish, and similar after-touch work should be non-blocking when kept.
- Default product intent is results first, polish later.
- If implementation drifts toward one blocking AI pass that must finish selection, rationale, drawbacks, badge labels, and badge reasons before results appear, treat that as drift.

## Non-goals
- Do not optimize around maximum AI cleverness at the expense of speed.
- Do not turn default finalize into a multi-request, staged, persisted, or polling workflow without explicit approval or an active scoped override.
- Do not widen shortlist count.
- Do not drift toward marketplace-style "show more" browsing.
- Do not treat architecture complexity as acceptable just because AI is involved.

## Hard constraints
- Unless the user explicitly approves, or an active scoped override applies, do not:
  - change the guided product flow
  - replace one-request finalize with a multi-request flow
  - add finalize persistence, polling, or orchestration layers
  - expand AI critical-path work
  - reinterpret reset/planning notes as approval for product changes
  - remove fit/caution guidance or badges just because they are hard to preserve

## Working rule
- Before finalize-related coding, ask:
  - does this make the app more like a fast guide or a heavy evaluator?
  - does this reduce real user wait time?
  - does this preserve current guided product behavior or clearly fit an approved experiment?
  - does this preserve fit/caution explanation value and scan-friendly guidance?
- If the answer is unclear, stop and ask before changing architecture.

## Status of older reset notes
- March 2026 reset notes are historical planning and measurement context.
- This file is the active strategy note unless the user explicitly replaces it or a scoped override applies.
