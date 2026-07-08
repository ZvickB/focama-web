# Account-Level Priority Preference — Feature Spec (PLANNED, not implemented)

Status: **proposal / design draft** — written 2026-07-07 for review (Codex: opinions welcome on anything here).
Nothing in this doc is built yet. Default behavior today is unchanged.

## What this is

Let a signed-in user set one account-level preference for how their shortlists are
ranked: **balanced (default) / lowest price / known brands / variety**. When set, every
search re-weights the finalize ranking accordingly and the UI quietly shows that the
preference is active. Signed-out users keep exactly today's behavior.

This came out of a product discussion: users may care more about price, or brand
names, or seeing a range of options — but Focamai's identity is calm and
one-question-focused, so this must not become per-search filter/knob UI. Account-level
was chosen deliberately over per-search controls because:

- Preferences like "I'm price-sensitive" are mostly stable traits, not per-search choices.
- Set once in settings → the per-search flow stays exactly as calm as it is today.
- It gives sign-in a real value proposition beyond history and price watches.

## How ranking changes (backend)

The Haiku finalize lock prompt (`buildNanoLockAndBadgesPrompt` in
`backend/lib/ai-selector.js`) currently hardcodes the ranking priority order:

> (1) inferred shopper intent and exact product fit, (2) quality confidence (rating,
> review count, trustScore, recognized brand), (3) price/value, (4) useful shortlist
> variety, (5) amazonPosition.

Design:

- Build the priority ordering from a **vars array** instead of hardcoded prose. The
  default array reproduces today's prompt **byte-identically** — no preference means
  zero behavior change.
- A user preference reorders **only the middle three** priorities (quality/brand,
  price/value, variety). Two things are pinned and never reorderable:
  - **Fit/eligibility stays #1.** "Lowest price" must never beat "it's actually the
    right product." All eligibility rules (budget as hard constraint, brand-in-query,
    dedupe, etc.) are untouched.
  - **amazonPosition stays last** (tiebreaker only).
- Important implementation detail: the prompt encodes the ordering in **two places** —
  the numbered "Ranking approach" steps AND the summary "final order priority" line.
  Both must be rendered from the same ordered structure, or the prompt contradicts
  itself and Haiku behavior gets unpredictable.
- The preference value is a **strict server-validated enum**
  (`default | price | brand | variety`). Never interpolate free user text into this
  part of the prompt. Unknown/missing values fall back to `default`.
- The preference must **also reach the gpt-5-mini enrichment prompt** so fit reasons
  and caveats speak to it (e.g. for a price-focused user: "cheapest of the six, but
  thinner review history"). If enrichment ignores the preference, the reordered picks
  will feel arbitrary. Caveat/honest-drawback tone rules are unchanged.

## Data + API

- New deliberate Supabase table (or single-row-per-user table) for user preferences,
  e.g. `user_preferences (user_id PK/FK, ranking_priority text, updated_at)`, with RLS
  so users read/write only their own row. Per project rules: this is a user-facing
  feature with its own schema — do **not** piggyback on telemetry tables
  (`search_history`, `search_attempts`, etc.).
- Frontend loads the preference once at auth/session load (alongside existing auth
  context) and sends it with the finalize request (and any re-rank path later).
- Backend treats it as advisory input on finalize: validate enum, apply var ordering.
  No preference field → default ordering. Signed-out users never send one.

## UX

### Setting it
- Entry point lives in the **account/header menu** ("Preferences" or similar) — it is
  an account setting, so it lives where account things live.
- Explicitly rejected: a "set preferences" chip inside the refinement chip grid. Those
  chips all write text into the notes box; a navigation chip breaks that pattern and
  adds account plumbing to the one-question screen.
- The settings surface is **one single-choice row**: Balanced (default) / Lowest
  price / Known brands / Variety. Single choice for now — multi-select ("price AND
  brands") is explicitly deferred.
- Discovery: a **one-time quiet hint** near results ("Tip: you can tell Focamai to
  always prioritize price or known brands — Set preferences"), dismissed permanently
  after interaction.

### While active
- Whenever a non-default preference is applied to a search, show a small passive
  indicator near the results, e.g. **"Prioritizing price"**.
- The indicator is **tappable as an escape hatch**: "Prioritizing price · not this
  time" (or "· change") lets the user drop back to balanced for the current search
  without visiting settings. Rationale: a global preference will sometimes be wrong
  per category (cheapest phone cables ≠ cheapest car seat), and the failure mode is a
  user who forgot they set it weeks ago and wonders why picks feel off. Always-visible
  indicator + one-tap per-search override is the safety valve.

### Signed out
- No dedicated "log in required" page. Tapping any preferences entry point while
  signed out opens the existing **`AuthModal`** with a contextual line ("Sign in to
  save your preferences"). Keeps the user where they were; reuses wiring that exists.

## Guardrails / constraints for whoever builds this

- Default path (no preference / signed out) must produce today's finalize prompt
  unchanged. This is the primary regression risk and the primary test.
- New data contract on finalize → tests in the same pass: default produces the
  unchanged prompt; each enum value produces the expected ordering in **both** prompt
  sections; invalid values fall back to default.
- Keep product voice rules: no hype copy, honest caveats stay, and a price-focused
  ranking must not turn fit reasons into bargain-hunting sales copy.
- Do not add marketplace-style filter/sort UI anywhere in the search flow. The only
  new search-flow surface is the passive indicator + its one-tap override.
- Dependency note: live QA of the auth flow (recovery email, RLS, history
  persistence) is still pending per `assistant-start.md`. This feature stacks on
  auth — QA auth before or alongside shipping this.

## Open questions (for review)

1. Does the per-search "not this time" override need to persist for the session, or
   just the current search? (Current lean: current search only, keep it simple.)
2. Should the preference also influence the refine question generation (e.g. skip
   asking about budget if the user already prioritizes price)? Current lean: no for
   v1 — finalize + enrichment only.
3. Where exactly the one-time hint renders and how its dismissal is stored
   (localStorage vs the preferences row).
4. Naming of the "variety" option in user-facing copy — "a range of options" may read
   better than "variety".
