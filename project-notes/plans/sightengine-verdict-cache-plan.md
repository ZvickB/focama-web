# Sightengine Verdict Cache — Implemented, tester rollout approved

Status: **application and database layers implemented locally as of 2026-07-08**.
Production reveal is approved for the current tester-only environment. The broader
accuracy review remains useful, and the reveal flag is the immediate kill switch.

## Goal
Let Sightengine verdicts actually reveal safe images in production, using cached
per-image verdicts ("option 1"), instead of shadow-only logging. A live-reveal
enrichment push ("option 2") may come later and builds on this — the verdict
store is shared, so option 1 is not lost work.

## Current state
- Shadow mode is live in production (`SENSITIVE_IMAGE_SHADOW_ENABLED=true` plus
  Sightengine keys are set on Render). The implemented queue checks the
  persistent verdict cache before billing and stores successful decisions;
  failures are logged but not persisted as verdicts.
- The regex rules in `backend/lib/content-moderation.js` hide images
  synchronously. Response-time batch lookup may then restore only images with
  a current cached `show`; newly queued analysis affects a later request.
- User has reviewed shadow results so far, reports they look fine, and accepts
  false-reveal risk for the tester-only rollout. The broader mannequin and
  partial-body sweep in `handoff.md` remains useful during rollout.

## Build steps
1. **Complete — Supabase table** for verdicts. Key: hash of image URL. Columns: verdict
   (`show`/`hide`), reasons/signals JSON, thresholds-version stamp, checked-at.
   Long TTL or none — an Amazon image URL points at a fixed image; invalidate by
   thresholds version instead. Store `hide` verdicts too (saves repeat billing).
   Add the table to `project-notes/db-needs.md`.
2. **Complete — Storage module** in `backend/lib/storage/` following the existing
   Supabase-plus-memory-fallback pattern (see `search-cache-storage.js`,
   `product-details-storage.js`).
3. **Complete — Write side**: the existing shadow queue saves each verdict to the table in
   addition to logging. Steps 1–3 are safe to ship early; user-facing behavior
   stays identical while verdicts bank up.
4. **Implemented and approved for tester production — Read side (the actual behavior change)**: before stripping an image in
   the response is returned, consult the verdict store; a cached `show`
   restores the stripped image through a batched asynchronous lookup. Set
   `SENSITIVE_IMAGE_REVEAL_ENABLED=true`
   for the controlled rollout; missing, stale, failed, or `hide` verdicts remain
   hidden. Set it back to `false` if a dangerous false reveal appears.

## Key nuance — discovery cache serves stale hidden images
Discovery results may be cached with images stripped, but moderated cache
records retain the image URL hash. Fresh and cached responses apply the latest
versioned verdict when serving, retrieving the original URL only from the
server-owned verdict table. Legacy stripped cache entries without a hash remain
hidden until refreshed.

## Product line for reveals (user decision, 2026-07-08)
Garment-only product shots are fine to reveal regardless of how revealing the
garment itself is — sexy lingerie on a white background is acceptable. The
criterion is no people/skin in the image, which matches the Sightengine
people/face decision logic. Do not treat correct person-free lingerie reveals
as failures when reviewing logs or tester feedback.

## Safety property (non-negotiable)
An image is only ever revealed by an explicit cached Sightengine `show`
verdict. No verdict, failed API call, or ambiguous signals all default to
hidden, same as today. Regex hiding remains the floor.

## Planned follow-up — local TF.js audit of `show` verdicts
A manually run local script will re-analyze every cached `show` verdict with
the offline TF.js harness and flag disagreements for human review. See
`project-notes/plans/tfjs-show-verdict-audit-plan.md` (planned, not implemented).

## Cost note
Every hidden image is a billed Sightengine call (two models). Caching `hide`
verdicts is where most billing savings come from. Check daily hidden-image
volume from shadow logs against the Sightengine plan before rollout.

## Implementation review
The overall direction and staged rollout are sound: bank verdicts first, verify
accuracy, and only then enable user-facing reveals. Tighten these details before
implementation:

- Do not persist provider failures as reusable `hide` verdicts. Successful
  analysis may produce `show` or `hide`; timeouts, credential problems, invalid
  responses, and storage failures should remain retryable errors. They still
  fail closed for the current response.
- Check the persistent verdict cache before calling Sightengine. The existing
  process-local `seenImages` map is lost on Render restarts and is not shared
  across instances, so it cannot prevent repeat billing by itself.
- Use a `decision_version`, not only a thresholds-version stamp. The version
  should change when models, thresholds, decision logic, or relevant URL
  normalization behavior changes.
- Step 4 requires a deliberate raw-versus-public data boundary, not only making
  `applyProductModeration` async. Images are currently stripped before the
  normalized discovery artifacts are cached, so the original URL must remain
  in server-owned cache data while every outgoing `results` and `candidatePool`
  payload is produced as a sanitized copy. Do not add a backup-image field that
  could accidentally reach the client.
- Prefer one async batch verdict lookup for a candidate set. A small in-memory
  layer may reduce reads, but Supabase should remain authoritative across
  restarts and multiple Render instances.
- Store the normalized URL alongside its hash for debugging, and keep URL
  normalization conservative. Amazon URL variants may refer to the same image,
  but overly aggressive normalization could reuse a verdict for different
  content.
- Gate reveal behavior separately from shadow collection. Add tests proving
  that missing, stale-version, malformed, ambiguous, and failed verdicts all
  remain hidden.
- Record verdict-cache hits and misses, provider calls, errors, and actual
  reveals so safety and billing can be measured after rollout.

The main implementation risk is preserving original URLs internally without
allowing an unmoderated cache path to expose them. Treat that response-boundary
work as the core of step 4 rather than a small synchronous-to-async refactor.
