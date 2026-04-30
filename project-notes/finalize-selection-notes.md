# Finalize Selection — Open Questions

## What was observed
- Search: "android phone", follow-up answer: "100 dollars"
- Before prompt fix: AI returned a $900 phone (ignored budget entirely)
- After prompt fix: 2 picks under $100, 1 at $150, 2 at $175, 1 at $900
- The improvement is real but one outlier remains

## What was already fixed
- All three selection prompts now treat user context as the dominant signal
- Hard constraint language added: exclude budget violations unless no better option exists
- Fallback instruction: if no candidate satisfies the constraint, prefer closest match (cheapest, not most popular)
- Rationale truncation raised from 160 → 300 chars to avoid mid-sentence cutoff
- Banned AI internal analysis ("search pool is wrong") from leaking into user-facing rationale

## Open question: is the one outlier a problem?
The $900 pick could be read as diversity (a premium reference point) or as the AI ignoring the user.
Worth watching in real usage before over-correcting.

## The question-context problem
The AI at finalize time only sees the user's raw answer ("100 dollars"), not the question that was asked ("What is your max budget?"). This means "100 dollars" is ambiguous — it could mean budget, quantity, or something unrelated.

The user field is intentionally freeform — the question is just a suggestion, users can write anything.

### Suggested fix
Send the question text from the frontend along with the finalize request, and include it in detailParts as:
"The user was asked: '{question}'. They responded: '{answer}'. Treat their response as freeform context, not necessarily a direct answer to the question."

### Effort
Moderate — frontend needs to store and send the question, backend needs to receive and include it, prompt framing needs the freeform caveat. A few moving parts across frontend and backend.

## The model vs prompt question
- Current model for context-aware selection: `gpt-5.4-nano` (fast, cheap, weak at constraints)
- Previous model: `gpt-5-mini` (better at following instructions, but ~12s latency — unacceptable)
- The 12s latency came from the selection step itself (picking 6 from 20), not enrichment

### Options considered
1. **Tighten the prompt** — done, helped but didn't fully solve it
2. **Trim candidate data** — would speed up mini but reduces quality since the model needs description/reasons to differentiate similar products
3. **Switch to Claude Haiku** — fast, cheap, good at structured output. May give mini-quality results at nano-speed. Not tested yet.
4. **Keep nano + accept one outlier** — results are now mostly correct, one off-budget pick may be acceptable diversity

### Recommended next step
Test the android phone + $100 case a few more times to see if the outlier is consistent or occasional. If it's consistent, try Claude Haiku as a drop-in replacement for the context-aware selection step before going further.
