# Layered Latency Plan

## Purpose
- This is the current planning note for the preferred layered AI latency strategy.
- This file is planning only. It does not mean the architecture is already implemented.
- Use it to guide future medium-reasoning implementation chats one step at a time.
- Current implementation is still the existing guided discover/prewarm/refine/finalize flow until these steps land.

## Core decision
- Prefer multiple smaller AI calls over one long monolithic AI session.
- Early layers prepare. Later user context decides.
- Query framing can run in parallel with discover.
- Query framing does not need discover results.
- Query framing should split into a user-visible `question-fast` output and a background `framing-fields` output.
- The user-facing follow-up question should return as soon as it is ready.
- The user should not wait for deeper AI reasoning about tradeoff axes, refinement hints, or later selection fields before seeing the question.
- Richer framing fields can finish later and be stored or attached for finalize-fast as background context.
- Candidate-aware prewarm is different from query framing and starts only after usable candidate data exists.
- User follow-up context is the strongest later decision signal.
- Finalize-fast should return shortlist-safe card data for the chosen 6.
- Recommendation-like cards should not reveal before shortlist certainty.
- Enrichment is a later explanation layer for the chosen 6.
- Enrichment explains the shortlist; it does not re-rank it.
- The modal should open immediately with core product facts, while explanation sections can load progressively if needed.

## Preferred layered flow
1. The user enters a broad product query.
2. Discover and query-framing work start in parallel.
3. The `question-fast` lane returns one useful follow-up question as soon as possible.
4. The frontend shows that question immediately and lets the user answer without waiting for richer framing fields.
5. The `framing-fields` lane can continue in the background with likely tradeoff axes, category hints, and later selection hints.
6. Once discover has a usable candidate pool, candidate-aware prewarm starts from real candidate data.
7. The user's follow-up context arrives and becomes the strongest decision signal.
8. Finalize-fast locks the real shortlist of 6 and returns card-safe fields.
9. Only after shortlist certainty do recommendation-like cards reveal.
10. Enrichment explains those same 6 picks in a later pass.
11. The modal can open immediately with core facts, while explanation sections fill in progressively if they are still loading.

## Layer breakdown

### Query framing
- Starts immediately from the raw user query.
- Does not wait for discover or depend on returned products.
- Has two distinct outputs:
  - `question-fast`: one short user-facing refinement question.
  - `framing-fields`: background metadata such as likely tradeoff dimensions, refinement hints, or category-specific evaluation axes.
- `question-fast` should be optimized for first useful UI paint.
- `framing-fields` should not block the user from seeing or answering the question.
- If the implementation cannot produce both in one non-blocking path, prefer returning the question first and letting fields arrive through a later/background route.
- Must stay overrideable later; it is a prior, not a decision owner.

### Frontend refine behavior
- After search submit, the refinement area should appear quickly.
- As soon as `question-fast` resolves, show the follow-up question.
- While richer `framing-fields` are still loading, the UI may keep simple helper/loading copy, but it should not hold back the question.
- Do not describe the later fields to users as if they are required for answering.
- Current UI should be documented honestly: animated helper copy is not the same thing as backend streaming unless a later implementation actually streams or progressively fetches the fields.

### Candidate-aware prewarm
- Starts only after discover has produced a usable candidate pool.
- Works from real candidate data, not just the query.
- Produces reusable candidate-aware structure or priors that can help later selection.
- Must not lock the shortlist before the user adds context.

### Finalize-fast
- Runs after follow-up context exists, including retry feedback when relevant.
- Combines the candidate pool, latest user context, query framing output, and candidate-aware prewarm output.
- Treats later user context as the strongest weighting signal.
- Returns the chosen 6 plus shortlist-safe card fields only.
- Should not block on richer explanations that can safely move to enrichment.

### Enrichment
- Runs only after the shortlist of 6 is locked.
- Explains why each chosen item fits and what tradeoffs matter.
- Can add stronger modal copy, drawbacks, and explanation sections.
- Must explain the chosen shortlist, not question it or quietly re-rank it.

### Modal fallback behavior
- The modal should be useful immediately after shortlist-safe data exists.
- Core facts should open right away: image, title, merchant, price, ratings, link, and other safe factual fields.
- If enrichment is not ready yet, only explanation sections should show loading states.
- Do not block the whole modal on explanation generation.

## Guardrails
- Keep implemented behavior and planned behavior clearly separated in future chats.
- Do not bring back provisional recommendation-like cards before shortlist certainty.
- Do not let enrichment quietly become a second ranking pass.
- Do not let query framing and candidate-aware prewarm collapse back into one vague step.
- Do not let `question-fast` and `framing-fields` collapse into a single blocking response if that makes the user wait longer to answer the refinement question.
- Do not redesign the architecture from scratch in each implementation chat; advance this plan step by step.
- The current thin contract source of truth for these planned layers now lives in `backend/lib/layered-contracts.js`.
- Those contracts are groundwork only; they do not mean the layered orchestration is already running in production.

## Implementation checklist
- [x] `status: done` Create and adopt this planning note as the current reference for the layered latency strategy.
- [x] `status: done` Define the thin contracts for `query framing`, `candidate-aware prewarm`, `finalize-fast`, and `enrichment` so later chats can change orchestration without rediscovering payload shape.
- [x] `status: done` Separate query framing responsibilities from discover-dependent work so framing can start immediately from the raw query.
- [x] `status: done` Split query framing into `question-fast` and background `framing-fields` so the UI can show the follow-up question before deeper AI field reasoning finishes.
- [ ] `status: pending` Update orchestration so discover, question-fast, and background framing-fields start without blocking each other, with clear telemetry for each lane.
- [ ] `status: pending` Re-scope prewarm so it starts only after usable candidate data exists and produces a candidate-aware prior rather than a premature final answer.
- [ ] `status: pending` Refactor finalize into a clear `finalize-fast` contract that returns only shortlist-safe card data for the chosen 6.
- [ ] `status: pending` Make the latest user follow-up or retry feedback the strongest later-stage decision signal in finalize-fast.
- [ ] `status: pending` Remove any too-early recommendation-style reveal path so real cards appear only after shortlist certainty.
- [ ] `status: pending` Add a separate enrichment pass for the locked shortlist of 6, with a contract that can explain but not re-rank.
- [ ] `status: pending` Update modal behavior so it opens immediately with core facts and lets explanation sections load progressively when enrichment is still in flight.
- [ ] `status: pending` Extend analytics and debug logging so each layer can be measured independently for latency, reuse, waste, and user-visible timing.
- [ ] `status: pending` Re-measure the layered flow on the same sample queries and compare speed, token usage, and shortlist quality before widening the rollout.

## Working note for future chats
- Default to medium-reasoning implementation passes after this planning note.
- Pick one pending checklist step per chat when possible.
- When a step changes active direction or current repo reality, update the relevant project notes in the same pass.
