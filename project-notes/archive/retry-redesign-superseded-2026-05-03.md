# Retry Section Redesign

## The problem with the current retry

The current retry assumes the candidate pool was good and the AI just picked wrong. But the more common failure mode is a pool problem — the user's original query pulled the wrong category or scope, so no amount of retrying from the same 20-candidate pool will surface what they actually wanted.

Current retry only helps when: right pool, imperfect selection.
It cannot help when: wrong scope, wrong category, or a query that was simply too broad or too narrow.

The current UI also reads like a customer service form — defensive, wordy, and it manages the user rather than helping them.

## Proposed direction

### AI-powered retry advice

When the user submits feedback about what felt off, a lightweight fast-model call (`/api/search/retry-advice`) analyzes:
- The original query
- The follow-up notes from the refine step
- The shortlist titles
- The user's rejection feedback

It returns either:
- A suggested new search query (if the pool was likely wrong)
- A retry recommendation (if the selection was likely the problem)

### UI — show both options

Show both paths, not just one:
1. **Suggested new query** — shown prominently when the AI thinks a new search would help. The query is editable.
2. **Retry from same pool** — still available as a secondary option for users who want a second pass on the existing candidates.

### "Try suggested query" flow

Clicking the suggested query:
- Scrolls to the top of the page
- Pre-fills the search bar with the suggested query (editable)
- User can modify it or leave it as-is, then submits normally
- Kicks off the full standard flow: discover → refine question → finalize
- Clean reset — no memory of the previous session

This is identical to the user typing a new search themselves. No special path or shortcuts.

### Copy direction

**Out:**
- "Didn't find anything you like? Tell us why."
- "We'll use your feedback for a more deliberate second pass instead of showing endless extra results."
- "Each retry needs a reason, so this stays focused."
- Long bulleted placeholder text

**In:**
- Section: "What would make these better?"
- Placeholder: "Too expensive, wrong style, not what I had in mind..."
- Button: "Try again"
- Suggested query card: "A more specific search might help" + editable query + "Search this instead"
- Exhausted state: "Nothing new came up from that feedback. Try a different search direction."
- Retry counter: cut entirely — the limit is a backend concern, not something the user should see unless they hit it

### Visual direction

TBD — whether to keep the card border or go lighter (inline input and button, no card). To be decided during implementation.

## What is not changing

- The 2-retry cap for same-pool retries
- The previous picks accordion (shown after a retry)
- The full discover → refine → finalize flow for new searches
- SPA format — no new page
