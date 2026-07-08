# TF.js Show-Verdict Audit — Plan (not yet implemented)

Status: **planned, no code written**. Agreed direction as of 2026-07-08.

## Goal
A local, offline second opinion on Sightengine `show` verdicts before they keep
revealing images forever. TensorFlow.js re-analyzes every image the verdict
cache has approved for reveal and flags disagreements for human review. This is
a safety audit of cached decisions — it never touches live requests and never
runs on Render.

## Why this shape
- Only `show` verdicts can cause harm (a wrong `hide` just keeps an image
  hidden), so the audit set is small — single digits per day at tester scale.
- The `sensitive_image_verdicts` table stores the normalized image URL with
  every verdict, which removes the old blocker recorded in `handoff.md`
  (sanitized cache entries had their URLs cleared, so a local evaluator had
  nothing to re-fetch). No separate evaluation queue is needed anymore.
- The audit reads the verdict table and fetches images directly — zero
  Sightengine billing.

## Hard constraint — never on Render
TF.js inference is CPU/memory heavy and was removed from Render because the
plan could not carry it; an inference spike inside the serving process can
stall or OOM live search. This audit runs only on the developer's machine.
Do not wire it into any route, queue, or Render job.

## Existing pieces (all already in the repo)
- `backend/lib/sensitive-image-analysis.js` — loads coco-ssd + MediaPipe face
  + MoveNet pose, exposes `analyzeSensitiveImageBuffer(buffer)`.
- `backend/lib/sensitive-image-decision.js` — `decideSensitiveImage(...)`
  returns `proposedOutcome: 'show' | 'hide'` with reasons and signals.
- `backend/lib/storage/sensitive-image-verdict-storage.js` + Supabase
  `sensitive_image_verdicts` table — source of `show` rows (hash, normalized
  `image_url`, signals, `decision_version`, `checked_at`).
- TF.js model deps and `sharp` are already in `package.json`.

## Build plan
One script: `backend/scripts/audit-show-verdicts.js`, run manually with
`node --env-file=.env backend/scripts/audit-show-verdicts.js`.

1. **Select rows to audit.** Query `sensitive_image_verdicts` for
   `verdict = 'show'` and the current `decision_version`, excluding hashes
   already recorded in the local audit ledger (below). Optional `--all` flag
   re-audits everything (e.g. after TF.js threshold changes).
2. **Fetch and analyze sequentially.** Download each image (https, allowed
   Amazon image hosts only — reuse the host allowlist idea from
   `sensitive-image-shadow.js`), run `analyzeSensitiveImageBuffer`, and compare
   TF.js `proposedOutcome` against the cached Sightengine verdict. Sequential,
   with a short polite delay between image fetches. Fetch failures are recorded
   as `fetch_failed`, not as disagreement.
3. **Record results in a local audit ledger.**
   `temp-data/sensitive-image-audit/ledger.jsonl`, one line per audited hash:
   hash, image URL, sightengine verdict, tfjs outcome, tfjs signals,
   `agreement: true|false`, audited-at. Local file, not Supabase — this is a
   personal offline harness; keep it out of production storage unless it
   proves useful enough to promote (note that explicitly if promoted).
4. **Print a review report.** Summary counts (agree / disagree / fetch failed)
   plus, for each disagreement, the image URL and both sides' signals so the
   image can be eyeballed in a browser.
5. **Human decision on disagreements — manual by design.** The script never
   changes verdicts. If an eyeballed image is genuinely bad, flip that row to
   `hide` manually (Supabase dashboard) and set a distinguishable reason such
   as `manual_override_tfjs_audit` so provider verdicts and human overrides
   stay tellable apart. If overrides become frequent, revisit Sightengine
   thresholds instead of scaling manual fixes.

## Judgment calls to respect
- TF.js disagreement is a **flag for human review, not an authority**. The
  reference measurements that led to Sightengine found weaknesses in both
  stacks; a TF.js `hide` on a mannequin shot may be the false positive. The
  product line from `sightengine-verdict-cache-plan.md` applies: the test is
  people/skin in the image, not how revealing the garment is.
- Keep the audit criteria aligned with that product line. TF.js reasons
  (`person_detected`, `face_detected`, `body_pose_detected`) map cleanly onto
  it; do not add category- or garment-based rules here.
- No cron/scheduler yet. Run it manually every few days while tester volume is
  small; add an overnight loop only if the manual cadence becomes a burden.

## Testing
- Unit-test the audit selection/comparison/ledger logic with mocked storage
  and analyzer (no live model load in tests).
- First real run doubles as validation: the 41 verdicts banked on 2026-07-08
  include 7 `show` rows whose images were already human-checked (garment-only),
  so the expected result is agreement on most, with any TF.js disagreements
  being inspectable known-safe images.
