# AI Latency Staged Ranking Plan

## Purpose
- This note captures the current thinking from the latency/planning conversation.
- It is a planning note only.
- It does not mean this architecture is already implemented.

## Core problem
- The current AI-backed finalize step can feel too slow for the product experience.
- Reported latency has been over 12 seconds and sometimes much worse.
- Reducing the candidate pool already hurt quality without improving latency enough.
- The main goal is perceived performance, not raw benchmark speed.

## Current verdict
- The staged idea is considered viable enough to plan further.
- The goal is not perfect ranking purity.
- The goal is for the user to feel understood, see useful products quickly, and trust the reasoning.
- This should be treated as a pragmatic v1 architecture if pursued, not as a final ideal system.

## Proposed staged flow
1. Discovery still builds the candidate pool.
2. An early AI call defines what considerations matter for the search and how important they are.
3. User context is always a dedicated field and should always be weighted more strongly than any other consideration.
4. Parallel AI scoring calls score products against that shared rubric.
5. The backend applies a deterministic weighted formula to rank products.
6. The frontend reveals useful products progressively with a smooth fade/stagger.
7. A later AI pass can add badge polish and other light presentation polish.
8. Slow scoring shards should not block the first reveal.
9. If only 4 strong products are ready, the app can still move forward with those.
10. Late-arriving products can still appear later with smooth motion instead of blocking the initial experience.

## Important clarified assumptions
- The parallel scoring calls are not meant to produce one relative overall rank against each other.
- They should return structured factor scores such as fit, price, quality, portability, durability, or other search-specific dimensions.
- The backend ranking should be deterministic.
- AI is mainly responsible for:
  - deciding what matters for this search
  - deciding how important each field is
  - scoring products against those fields
  - generating fit-oriented explanation text
- The backend is mainly responsible for:
  - combining scores consistently
  - choosing the first visible results
  - handling timeouts and late arrivals
- Badges can be delayed.
- The trust-building "why this fits you" explanation does not need to wait for the later badge pass.

## Why this direction still makes sense
- Perceived speed is the product problem right now.
- UX polish alone likely will not be enough if the user is still waiting a long time for meaningful completion.
- The product benefits from progressive completion more than from one final reveal after a long black-box pause.
- The user is comfortable paying somewhat higher token cost if that materially improves the experience.

## Main concerns discussed

### 1. Score consistency
- Concern: AI factor scores need to be stable enough for backend ranking to be trustworthy.
- Current view: acceptable if the factors stay concrete and structured rather than fuzzy.

### 2. Late shards and missing strong products
- Concern: a slow shard could hide a strong candidate.
- Current view: softened by allowing the first reveal to proceed while still allowing late products to appear later.

### 3. Token cost
- Concern: repeated prompt overhead will increase token usage.
- Current view: acceptable for now because user growth matters more than tiny early-stage token savings.

### 4. Complexity
- Concern: the staged system is more complex than the current single finalize call.
- Current view: acceptable as a temporary product-survival architecture if it remains inspectable and disciplined.

### 5. Explanation and badge coherence
- Concern: delayed badges might feel disconnected from product choice.
- Current view: softened because fit explanations can come from the first pass and badges can be treated as later polish.

### 6. Formula quality
- Concern: the deterministic formula could become the hidden real ranking brain.
- Current view: acceptable if AI first defines the important fields and their weights, while the backend then combines them deterministically.

### 7. Debugging difficulty
- Concern: bad results could be harder to diagnose across multiple stages.
- Current view: acceptable if the system logs intermediate decisions clearly.

### 8. Simpler alternatives
- Concern: maybe UX polish alone could solve perceived speed.
- Current view: probably not enough on its own given the current latency problem.

### 9. UX clarity
- Concern: staged results could confuse users if they do not understand what is final versus still arriving.
- Current view: open question that likely needs prototyping rather than abstract debate.

### 10. Stage boundaries
- Concern: responsibilities could blur between AI, backend, and frontend.
- Current view: boundaries already seem reasonably clear in concept and should be protected during implementation.

### 11. First-pass bloat
- Concern: the first AI pass could become another oversized slow call.
- Current view: the first pass should stay focused on defining the rubric, not doing every job.

### 12. Overfitting to user intent
- Concern: strong user intent could overpower obvious quality signals.
- Current view: the weighted system should prevent that, and drawbacks can explain the tradeoff honestly.

### 13. Formula tuning
- Concern: weights and formula behavior will likely need iteration.
- Current view: expected and acceptable; this app is being tuned continuously, not one-shotted.

### 14. Artificial feel
- Concern: the user may feel the machinery too much.
- Current view: likely needs A/B testing rather than theory alone.

### 15. Future sprawl
- Concern: staged logic could grow into too many passes and exceptions.
- Current view: manageable if the first version stays minimal and later refinements are explicitly deferred.

## Observability requirement if pursued
- If this architecture is built, it should expose enough intermediate state to debug and tune it.
- Helpful visibility would include:
  - what AI decided matters
  - how important each field was
  - factor scores returned by scoring calls
  - backend total scores
  - which shards were late
  - which products were shown first
  - which arrived later
  - what the later badge pass changed

## Related measurement note
- Token-usage measurement plumbing was already added separately for current AI refine/finalize/live responses.
- That is a measurement aid only.
- It is not part of the staged-ranking feature.

## Open questions for the next chat
- Exact payload shape for the rubric-defining AI call
- Exact payload shape for per-product or per-shard scoring calls
- Which factors should always exist versus be dynamic
- How the deterministic backend formula should work in v1
- Exact timeout and late-arrival behavior
- Whether late products should append, replace, or live in a secondary section
- How badges should appear later without feeling jarring
- What logging should be mandatory before rollout
- What to prototype first for UX validation

## Recommended next step
- Start a fresh chat and turn this note into a concrete design plan.
- Keep that next chat focused on contracts, state transitions, ranking formula, timeout rules, and observability.
