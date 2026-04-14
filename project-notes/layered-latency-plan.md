# Layered Latency Plan

## Purpose
- This is the current planning note for the preferred layered AI latency strategy.
- This file is planning only. It does not mean the architecture is already implemented.
- Use it to guide future medium-reasoning implementation chats one step at a time.

## Core decision
- Important correction: for finalize, the active desired experiment is one streamed AI session with ordered phase events, not separate post-lock AI calls.
- Separate preparatory lanes are still useful before finalize:
  - query framing can split into `question-fast` and `framing-fields`
  - candidate-aware prewarm can run after discover has real candidates
- The finalize stream should be one backend request and one OpenAI streaming call that emits:
  1. `winners_locked`: selected candidate IDs only, validated and treated as final
  2. `badges_ready`: badge labels for the same locked IDs
  3. `enrichment_ready`: fit/tradeoff/caution writing for the same locked IDs
- Do not implement badges or enrichment as separate OpenAI calls for this active finalize-stream experiment.
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
- Enrichment is a later phase for the chosen 6 inside the same streamed finalize AI session for the active experiment.
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
10. In the active streaming finalize experiment, badges and enrichment arrive as later events from the same OpenAI stream, not separate OpenAI requests.
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
- The normal non-streamed prepared/prior finalize path measured as a latency regression, so prewarm's role in the active stream path is unproven and must be compared against a no-prewarm stream variant.

### Finalize-fast
- Runs after follow-up context exists, including retry feedback when relevant.
- Combines the candidate pool, latest user context, query framing output, and candidate-aware prewarm output.
- Treats later user context as the strongest weighting signal.
- Returns the chosen 6 plus shortlist-safe card fields only.
- For the active experiment, should be tested as a streamed phase sequence from one AI session:
  - lock winners first
  - then emit badges
  - then emit enrichment
- Winners become immutable once emitted; later phases must never add, remove, reorder, or re-rank them.

### Enrichment
- Runs only after the shortlist of 6 is locked.
- Explains why each chosen item fits and what tradeoffs matter.
- Can add stronger modal copy, drawbacks, and explanation sections.
- Must explain the chosen shortlist, not question it or quietly re-rank it.
- For the active finalize-stream experiment, enrichment means "later in the same stream," not "a later OpenAI request."

### Modal fallback behavior
- The modal should be useful immediately after shortlist-safe data exists.
- Core facts should open right away: image, title, merchant, price, ratings, link, and other safe factual fields.
- If enrichment is not ready yet, only explanation sections should show loading states.
- Do not block the whole modal on explanation generation.

## Guardrails
- Keep implemented behavior and planned behavior clearly separated in future chats.
- Do not bring back provisional recommendation-like cards before shortlist certainty.
- Do not let enrichment quietly become a second ranking pass.
- Do not translate the active finalize-stream experiment into separate AI calls for winner lock, badges, and enrichment.
- Do not propose deterministic badges as the active next direction unless the user asks; they remain a fallback/alternative, not the current requested experiment.
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
- [x] `status: done` Update orchestration so discover, question-fast, and background framing-fields start without blocking each other, with clear telemetry for each lane.
- [x] `status: done` Re-scope prewarm so it starts only after usable candidate data exists and produces a candidate-aware prior rather than a premature final answer.
- [x] `status: done` Refactor finalize into a clear `finalize-fast` contract that returns only shortlist-safe card data for the chosen 6.
- [x] `status: done` Build a temporary finalize-stream measurement path that uses one OpenAI streaming call and emits ordered phase events: `winners_locked`, `badges_ready`, `enrichment_ready`, and `done`.
- [x] `status: done` Measure the streamed finalize path for time to first token, time to `winners_locked`, time to `badges_ready`, time to first/top enrichment, time to all enrichment, total tokens, winner validity, and locked-ID/order preservation.
- [x] `status: done` Compare stream-with-prewarm against a no-prewarm stream variant so prewarm has to earn its place in the streamed architecture.
- [x] `status: done` Close the mini one-call stream model question: `gpt-5-mini` is too slow for one-call streamed finalize, while `gpt-5.4-nano` remains the only plausible fast stream model from current measurements.
- [ ] `status: pending` Add only a smallest harness mode for the new nano-lock plus mini async-enrichment experiment.
- [ ] `status: pending` Measure nano winner/badge lock latency, mini enrichment latency, model-specific tokens, and locked-ID/order preservation on `context5`.
- [ ] `status: pending` Make the latest user follow-up or retry feedback the strongest later-stage decision signal in finalize-fast.
- [ ] `status: pending` Remove any too-early recommendation-style reveal path so real cards appear only after shortlist certainty.
- [ ] `status: pending` Update modal behavior so it opens immediately with core facts and lets explanation sections load progressively when enrichment is still in flight.
- [ ] `status: pending` Extend analytics and debug logging so each layer can be measured independently for latency, reuse, waste, and user-visible timing.
- [ ] `status: pending` Re-measure the layered flow on the same sample queries and compare speed, token usage, and shortlist quality before widening the rollout.

## Working note for future chats
- Pick one pending checklist step per chat when possible.
- The temporary `stream-clean` harness path measured the one-call stream idea; do not productize it or wire frontend from that branch without explicit approval.
- The next measurement direction is separate and harness-only: nano locks winners/badges quickly, then mini writes nicer copy in a non-blocking second call.
- When a step changes active direction or current repo reality, update the relevant project notes in the same pass.
- Current orchestration reality after the latest step:
  - the frontend starts guided discovery, `/api/search/refine` question-fast, and `/api/search/framing-fields` background framing independently on search submit
  - `/api/search/refine` remains the user-visible question lane and does not wait for framing fields
  - `/api/search/framing-fields` returns the query-framing contract and telemetry as a background lane
  - framing fields are currently captured client-side for timing/debug visibility, but they are not yet stored server-side or consumed by finalize-fast
  - `/api/search/prewarm` starts from usable discovery candidates and stores a `candidate_aware_prewarm` prior
  - the prewarm prior is not a final answer and guided finalize no longer materializes result cards directly from it
  - `/api/search/finalize` now returns a `finalizeFast` contract plus `results` derived from that contract for the locked shortlist
  - blocking finalize card data is shortlist-safe only: selected ids, core product facts, one concise fit reason, and no blocking drawback/caution copy
  - temporary local-only measurement route `POST /api/search/finalize-stream` runs one OpenAI streaming call for ordered phase events and is not wired to the frontend or Vercel wrappers
  - `backend/scripts/measure-guided-finalize.js --mode stream-clean` compares baseline finalize against the streamed one-call path in the same harness run
  - full context5 `stream-clean-context5` measurement completed 5/5 cases: average `winners_locked` was about 2.24 s vs baseline shortlist lock about 4.29 s, later badge/enrichment phases preserved locked order in 5/5, full stream completion averaged about 6.92 s server-side and about 2534 tokens
  - full context5 `stream-prewarm-compare-context5` measurement completed 5/5 cases: no-prewarm locked about 265 ms earlier but used about 387 more tokens and had lower winner overlap; prewarm is not justified as a latency feature
  - full context5 mini stream comparison completed 5/5 cases: mini locked winners around 8.1-8.5 s and full stream took around 19 s, so mini is rejected for one-call streamed finalize
