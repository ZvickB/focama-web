# Finalize Strategy

## Purpose
- This note is the current decision memo for finalize strategy and AI scope.
- It is meant to be explicit enough that future chats do not reinterpret the current direction.
- If a future assistant wants to change the current product flow or these guardrails, it must stop and ask for permission first.

## What problem this note is solving
- The current guided product flow is still the intended product path:
  - `/api/search/discover`
  - `/api/search/refine`
  - `/api/search/finalize`
- The product flow itself is not the problem.
- The problem is that finalize is still too slow for the intended user experience.
- Recent experiments showed that nearby variants of the same heavy finalize pattern did not solve the latency problem:
  - prompt slimming helped somewhat
  - compact shard scoring regressed latency and token usage
  - more aggressive candidate minimization hurt quality without delivering enough speed
- This note exists so future work does not keep repeating those same experiments without first checking whether they still fit the product goal.

## Current product goal
- Focamai should be a calm, focused shopping guide that helps a user get to a short usable set of options faster and more clearly than a marketplace.
- The app is not trying to be a slow, deep-evaluation shopping analyst by default.
- The product should feel:
  - calm
  - search-first
  - mobile-first
  - focused
  - faster than the current heavy finalize behavior
- For v1, perceived speed is the primary UX goal.
- Showing a trustworthy shortlist sooner matters more than waiting for complete polish before anything appears.

## Current working conclusion
- AI should still be part of Focamai.
- AI should not be responsible for the heaviest possible ranking and explanation workflow on every search.
- The product should move toward a hybrid v1:
  - keep AI in the loop where it adds real value
  - narrow AI's critical-path responsibilities
  - let deterministic backend logic own more of the structure, guardrails, and presentation defaults

## AI's role in Focamai
- AI should help with:
  - understanding what the user really wants
  - turning vague or nuanced user input into stronger shopping context
  - improving narrowing beyond raw search keywords
  - helping shortlist quality feel more tailored than a marketplace
  - surfacing concise fit/caution guidance when it materially helps
- AI should not be expected to:
  - own the heaviest possible final ranking process on every query
  - expand into more orchestration, persistence, or polling in the default flow
  - generate large amounts of structured polish before results can appear
  - absorb work that deterministic backend logic can do more cheaply and more quickly

## What must be preserved
- The following product behaviors are considered core and should be preserved unless the user explicitly decides otherwise:
  - results should still feel interpreted for the user's stated need
  - the user should still see why a result is good for what they want
  - the user should still see a meaningful caution or downside
  - scan-friendly badges should still exist because they help users compare quickly
- The valuable part is not "lots of AI text."
- The valuable part is the feeling that Focamai understands the user and explains the shortlist clearly.

## What likely needs to change
- Finalize should not keep trying to do all of the following at full weight in one expensive step:
  - deep comparative ranking
  - shortlist selection
  - rich rationale generation
  - drawback generation
  - badge generation with bespoke badge reasons
- That bundle is closer to a deep AI evaluator than to the intended fast shopping guide.
- The likely strategy is:
  - keep shortlist quality
  - keep concise fit/caution guidance
  - keep badges
  - reduce how much expensive AI work is done before the shortlist can appear

## Badge strategy direction
- Badges are still considered important product value.
- The current direction is not "remove badges."
- The current direction is "keep badges, but make them cheaper."
- Strong likely direction for v1:
  - AI helps choose the shortlist
  - deterministic app logic assigns badges after selection using structured signals and clear rules
  - do not require AI to generate badge reasons in the critical path unless the user explicitly approves that tradeoff later

## Explanation strategy direction
- "Why this is good or bad for what you want" is considered a core product feature.
- It should stay.
- What may change is the production shape:
  - shorter fit explanation lines
  - shorter caution lines
  - richer explanation for only the top result or top few results
  - more reuse of deterministic/backend signals where possible
- Do not assume that preserving this feature requires preserving the current heavy finalize output contract.

## V1 strategy direction
- Default product direction:
  - fast guide
  - hybrid v1
  - not deep evaluator by default
- In practical terms:
  - discovery remains the candidate-pool builder and cache boundary
  - refine stays lightweight and search-context focused
  - finalize should become narrower in responsibility, not broader
  - backend should own as much deterministic cleanup, fallback logic, and presentation structure as is reasonable
- A slower or heavier evaluation lane may still be a good future idea for a minority of queries or future premium use cases, but that is not the default v1 architecture and must not be used as justification for keeping the default path slow now.

## Explicit v1 ownership split
- The intended v1 behavior is:
  - show the shortlist as soon as core selection is ready
  - keep the app feeling fast, calm, and interpreted
  - allow polish to arrive later only if it does not block the shortlist
- If a tradeoff is required, prefer earlier trustworthy results over fuller first-paint completeness.
- Finalize should own the blocking work needed to produce the shortlist:
  - choose the final results from the cleaned candidate pool
  - apply the user's live query context, follow-up notes, and retry feedback
  - preserve concise fit/caution value in the lightest form that still feels useful
- Finalize should not be treated as the place to finish every piece of presentation polish before the user sees results.
- Badge polish, richer explanation polish, and similar after-touch work should be treated as non-blocking enrichment if they are kept.
- The original product intent is results first, polish later.
- If the implementation drifts toward one blocking AI pass that must finish shortlist selection, rationale writing, drawback writing, badge selection, and badge-reason writing before results appear, treat that as drift away from the intended v1 direction rather than as the default plan.
- This does not automatically approve new architecture.
- If a future implementation wants to let enrichment arrive after the shortlist, it must still be introduced deliberately and clearly, not by accident.

## Non-goals for the current phase
- Do not optimize the product around maximum AI cleverness at the expense of speed.
- Do not turn finalize into a multi-request workflow, staged workflow, or persisted workflow.
- Do not add polling or background advancement as part of the default product flow.
- Do not widen shortlist count.
- Do not drift toward a marketplace-style "show more" browsing experience.
- Do not treat architecture complexity as acceptable just because AI is involved.

## Hard constraints
- Unless the user explicitly gives permission first, do not:
  - change the current guided product flow
  - replace one-request finalize with a multi-request flow
  - add finalize persistence, polling, or orchestration layers
  - expand AI critical-path work
  - reinterpret a reset/planning note as approval for a product change
  - remove fit/caution guidance or badges just because they are hard to preserve
- If a future assistant believes one of those changes is necessary, it must stop and ask first.

## Working rule for future implementation
- Before a finalize-related coding step, ask:
  - does this make the app feel more like a fast guide or more like a heavy evaluator?
  - does this reduce real user wait time?
  - does this preserve the current guided product flow?
  - does this preserve fit/caution explanation value and scan-friendly guidance?
- If the answer is unclear, stop and ask before changing architecture.

## Status of earlier reset notes
- The March 2026 reset notes were useful for recovering from the staged/persisted finalize drift and for measuring the current bottleneck.
- They should now be treated as archived historical planning material, not as the main active strategy note.
- This file is the active strategy note going forward unless the user explicitly replaces it.
