# Account-Level Priority Preference — Feature Spec (PLANNED, not implemented)

Status: **experiment branch implementation** — first built 2026-07-09 on branch
`account-ranking-preferences` for local review. Do not treat it as merged/shipped
until UX/auth/Supabase QA passes.

## What this is

Let a signed-in user set one account-level preference for how their shortlists are
ranked: **balanced (default) / lowest price / known brands / range of options**. When set, every
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

- Build the ranking language from explicit strategy branches instead of hardcoded
  prose. The balanced branch reproduces today's ranking order.
- A user preference changes only ranking emphasis after fit/eligibility. Two things
  are pinned and never reorderable:
  - **Fit/eligibility stays #1.** "Lowest price" must never beat "it's actually the
    right product." All eligibility rules (budget as hard constraint, brand-in-query,
    dedupe, etc.) are untouched.
  - **amazonPosition stays last** (tiebreaker only).
- Important implementation detail: the prompt encodes the ordering in **two places** —
  the numbered "Ranking approach" steps AND the summary "final order priority" line.
  Both must be rendered from the same ordered structure, or the prompt contradicts
  itself and Haiku behavior gets unpredictable.
- The preference value is a **strict server-validated enum**
  (`balanced | price | brand | range`). Never interpolate free user text into this
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
  price / Known brands / Range of options. Single choice for now — multi-select ("price AND
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

## Codex review — 2026-07-08

The product direction is strong: an account-level setting adds meaningful sign-in
value without turning the search flow into marketplace-style filters. Keeping the
setting out of the refinement screen and providing a visible per-search escape hatch
both fit Focamai's calm, focused identity.

The main concern is the proposed implementation as a simple reordering of the middle
three ranking priorities. Those concepts are not equivalent ranking dimensions:

- **Lowest price:** the current prompt says "price/value," which is not the same as
  deliberately preferring the lowest acceptable price. This mode needs explicit
  language about choosing lower-priced credible products after eligibility and fit,
  while retaining a reasonable quality floor.
- **Known brands:** brand is currently one part of the larger quality-confidence
  block alongside rating, review count, and trustScore. Moving that entire block
  changes much more than brand preference. Brand emphasis should be its own
  instruction between otherwise credible, similarly fitting candidates; basic
  quality confidence should remain protected in every mode.
- **Variety:** variety is a property of the shortlist as a set, not an ordinary
  candidate-ranking signal. Raising it in the numbered order could weaken the top
  recommendation merely to make the list more diverse. A range-focused mode should
  keep the strongest overall fit first, then deliberately diversify the remaining
  picks across meaningful price points, formats, or use cases where quality is
  comparable.

Because of that, the implementation should probably use explicit ranking strategies
rather than mechanically permuting three prompt fragments:

- `balanced`: reproduce today's prompt byte-for-byte.
- `price`: after eligibility and exact fit, favor the lowest-priced credible options
  while preserving a quality floor.
- `brand`: favor recognized category brands among similarly fitting, credible
  products without letting familiarity override fit or clear quality concerns.
- `range`: preserve the strongest overall recommendation at #1, then make picks #2–6
  cover useful differences where possible.

Additional recommendations and implementation questions:

- Use one enum vocabulary consistently. `balanced | price | brand | range` maps more
  cleanly to the proposed user-facing labels than mixing `default`, "Balanced," and
  "variety."
- Decide whether the setting is genuinely account-gated. If the browser sends the
  preference in the finalize body, "signed-out users never send one" is only a
  frontend convention. The backend could verify the authenticated user and load the
  stored preference itself, or the product can deliberately accept the enum as
  harmless advisory input from any client. This should be an explicit choice.
- Pass the effective preference into the asynchronous mini-enrichment call and/or
  token-scoped selection state. Enrichment currently runs after Haiku locks the
  winners, so adding the value only to the initial finalize request will not
  automatically make it available there.
- Record the effective ranking strategy in finalize diagnostics/history. Without
  that context, intentional preference effects may look like ranking regressions.
- Keep prompt snapshot tests for the byte-identical balanced path, but also test each
  strategy against small fixed candidate pools. Correct prompt wording alone does
  not prove that the resulting shortlist behavior is sensible.
- Keep the per-search override limited to the current search in v1, and do not alter
  refine-question generation yet.
- "Range of options" is clearer user-facing language than "Variety."
- Store the one-time educational hint dismissal in localStorage. It is lightweight
  onboarding state rather than an important cross-device account preference.

One UX behavior still needs definition: if the user taps "not this time" after the
results have already been generated, does Focamai immediately run finalize again, or
does the override apply only to the next search? If it triggers another finalize,
the action should say something explicit such as **"Redo with balanced picks"** so
the user understands that the recommendations will change and another ranking call
will occur.

Overall opinion: this is worth pursuing, but the ranking behavior should be designed
as four explicit strategies before implementation. The settings and escape-hatch UX
are already pointed in the right direction; strategy semantics and authenticated
preference handling are the two areas that need more thought.

## Implementation pass — 2026-07-09

Built on branch `account-ranking-preferences`:

- Shared enum: `balanced | price | brand | range` in `shared/ranking-preference.js`.
- Signed-in account Preferences modal from the header account menu.
- Supabase-backed `user_preferences` frontend store with soft failure if the table is
  absent locally.
- Preference sent in the finalize request body as advisory input; backend strictly
  normalizes missing/unknown values to `balanced`.
- Haiku ranking prompt uses explicit strategy branches:
  - `balanced`: original product-fit → quality → price/value → variety → Amazon
    position order.
  - `price`: fit/eligibility first, then lowest-priced credible picks after a quality
    floor.
  - `brand`: fit/quality first, then recognized category brands among comparable
    credible products.
  - `range`: strongest hero first, then meaningful range across picks #2-6 where fit
    and quality are comparable.
- Async mini enrichment receives the same effective preference.
- Non-balanced final results show a passive indicator with a current-search
  `redo balanced` action.
- Balanced final results can show a one-time localStorage-dismissed tip that opens
  Preferences or signed-out auth copy.
- Targeted selector tests and production build pass.

Still required before merge/ship:

- Create `public.user_preferences` with RLS in Supabase.
- Live QA auth recovery/history/preferences together.
- Try the UI on desktop/mobile and decide whether the results hint and indicator copy
  feel too visible.
- Run a few real searches in each strategy and inspect whether the ranking behavior
  feels genuinely helpful.
