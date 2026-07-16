# Web UI Improvement Plan

## Purpose
- Capture the biggest UI/UX lessons from the mobile app that are worth adapting to web.
- This is not a wholesale mobile port.
- Web should stay optimized for desktop and responsive browser use while borrowing the strongest product lessons from mobile.

## Guiding idea
Mobile is stronger because it feels like a guided decision flow:

Search -> Refine -> Picks -> Detail

Web should move closer to that clarity without becoming a phone app in a browser.

## Priority 1: Results layout
Status: implemented in the first `new_web_ui` slice.

Update: desktop results now extend this slice with a mobile-inspired selected-product preview. Wide screens show a large selected product/image panel beside an internally scrolling ranked row list; the selected panel updates from hover/focus and from the top visible row while the list scrolls. Smaller screens keep the stacked ranked cards.

Biggest expected gain.

Current web results still feel close to a product-card marketplace grid. Mobile is stronger because it presents the six picks as a ranked shortlist with one selected pick getting more context.

Proposed web direction:
- Use a ranked shortlist instead of only a grid.
- Use a single ranked list of six picks instead of a side-by-side preview.
- On desktop, use the available width for a stable selected-product image panel beside the ranked rows.
- On smaller screens, collapse into stacked ranked cards.
- Keep all six picks feeling credible. Do not make pick 1 feel like the only real answer.
- Keep reasoning/caveats in the modal for now so the results screen does not present too much information at once.

Why this helps:
- Makes Focamai feel like it is narrowing and explaining.
- Reduces marketplace browsing energy.
- Uses desktop width for comparison and decision support.

## Priority 2: Stronger flow chapters
Status: implemented as the second `new_web_ui` slice.

Current web keeps search, refine, loading, results, and retry in one long homepage composition. Mobile feels cleaner because each step has a job.

Implemented web direction:
- Keep the homepage search-first.
- After search starts, collapse the completed search stage, including the large hero/search screen, into a compact progress line and search summary receipt.
- Make the refine step its own active panel instead of nesting it under the search form.
- After final picks appear, collapse refinement into a compact summary above the results.
- Use lightweight Search / Refine / Picks progress text for orientation.
- Keep progress visible but lightweight.
- Avoid adding a heavy app shell or fake onboarding.

Why this helps:
- Users understand where they are.
- Refinement feels intentional instead of like an expanded form.
- The app feels more product-like and less landing-page-like.

## Priority 3: Refine step polish
Status: implemented in the third `new_web_ui` slice.

Mobile's refine copy is clearer: "What should Focamai keep in mind?"

Implemented web direction:
- Make the follow-up area feel like the intelligent middle step.
- Show the AI follow-up question clearly.
- Show up to 3 short refinement chips, using backend suggestions when available and fallback chips when not.
- Let the user replace the primary question once through `Ask a different question`; the alternate is generated in the original response and appears after a short breathing-dot transition without removing the chips or clearing notes.
- Match mobile chip behavior: label-only chips append to notes, richer prompt chips fill the notes box, and selected chips get a subtle selected state.
- Keep the notes box natural-language first.
- Make "Show focused picks" the primary action.
- Keep preview/show-products-now as a quieter escape hatch.

Why this helps:
- Encourages useful context.
- Makes the user's notes feel important to the final six.
- Reduces the feeling that refinement is optional clutter.

## Priority 4: Better finalize/loading state
Status: implemented in the fourth `new_web_ui` slice.

Mobile explains what is happening during the wait:
- Reading your search
- Applying your notes
- Narrowing to six picks
- Getting the shortlist ready

Implemented web direction:
- Keep skeleton cards, but wrap them in staged progress copy.
- Use calm status text instead of generic loading.
- Make the wait feel like judgment work, not just network delay.

Why this helps:
- The user understands why the app takes a few seconds.
- It reinforces the core promise: fewer, better picks.

## Priority 5: Product detail decision support
Status: implemented in the fifth `new_web_ui` slice.

Web can keep a modal or side panel, but the content should borrow mobile's stronger order.

Implemented web direction:
- Lead with image and core facts.
- Put "Why this pick" high and make it feel like the intelligence layer.
- Keep "Worth knowing" close to the reason.
- Keep the shopping clickout CTA and affiliate/availability disclosure together. If the active source is Amazon, the CTA can say Amazon directly.
- Use feature bullets as support, not the whole story.

Why this helps:
- The detail view becomes a buying decision aid.
- Caveats feel honest instead of hidden.
- The CTA has better trust context.

## Priority 6: Visual system discipline
Status: implemented in the sixth `new_web_ui` slice.

Mobile has a clearer visual system: warm ivory background, cream surfaces, teal action, restrained orange, consistent radii, and Manrope-first hierarchy.

Implemented web direction:
- Reduce decorative gradients and glow.
- Use fewer competing card styles.
- Keep orange as rare emphasis.
- Make surface, border, image-frame, and button styles more consistent.
- Keep the PNG wordmark.

Why this helps:
- Web becomes calmer and more premium.
- The experience feels less experimental.
- The product identity becomes more consistent across web and mobile.

## Priority 7: Retry simplification
Status: implemented in the seventh `new_web_ui` slice.

Mobile retry is simpler: say what felt off, get a suggested next search, edit it if needed, search again.

Implemented web direction:
- Place one expandable `Improve these picks` card directly after the shortlist, rather than splitting the entry point, editor, and a floating reminder across the page.
- Keep one freeform correction box and the `Update my picks` action; do not add quick-correction chips or a back-to-results detour.
- Once submitted, replace the editor with a non-editable update state. When retry advice returns, keep its improved query visible in that same results location while the refreshed search starts.
- A safe non-empty AI `suggestedQuery` starts the refreshed guided search automatically; the generated query is no longer a required second confirmation field.
- Removed the `Keeping:` tag reassurance UI and the separate `Search this` / `Edit first` split.
- Kept the same `/api/search/retry-advice` backend contract.

Why this helps:
- Less cognitive load after a bad result set.
- Keeps the app from becoming endless browsing.

## Suggested work order
1. Done: redesign the results area into a ranked shortlist without a side preview.
2. Done: adjust the search/refine/picks flow so completed stages collapse into summaries and the current stage owns the workspace.
3. Done: polish the refine step with chips and stronger copy.
4. Done: add staged finalize loading.
5. Done: rework product detail content order.
6. Done: tighten the visual system.
7. Done: simplify retry.

## What not to do
- Do not port React Native components into web.
- Do not make web behave like a mobile stack navigator.
- Do not add saved/history/profile/compare surfaces as part of this pass.
- Amazon can be named clearly as the current shopping destination/source, but it should not become Focamai's brand identity or visual style. The UI should feel like Focamai helping the user decide, not like browsing Amazon inside Focamai.
- Do not change the backend contract unless a specific UI improvement truly needs it.
- Do not change the six-pick product rule unless explicitly chosen.

## Notes for implementation
- Keep changes small and reviewable.
- Update `project-notes/app_flow.md`, `project-notes/current-status.md`, and `project-notes/session-handoff.md` after meaningful product-flow changes.
- Treat this document as a plan, not a source of implemented behavior.
