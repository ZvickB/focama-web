# Dead Weight Audit
_Last updated: 2026-04-19_

Tracks data that is computed, included in AI schemas/prompts, or sent over the wire but never actually consumed downstream. Use this before adding more fields — check here first.

---

## Already removed

- **`lockedBadges` / `badge_label`** — nano was generating badge labels in its AI schema and returning them in the finalize response. The frontend never read them; badges are computed deterministically client-side in `resultPresentation.js`. Removed 2026-04-19.

---

## Confirmed dead weight

### 1. `finalizeFast` top-level key in `/api/search/finalize` response
- **Where produced:** `server.js` ~line 1701 — sent as top-level `finalizeFast` in the JSON body
- **What the frontend reads:** `payload.results` (which is aliased to `finalizeFast.shortlist` on the same response), `payload.retryCount`, `payload.selection`, `payload.timing`
- **What is unused:** The `finalizeFast` key itself — the frontend never reads `payload.finalizeFast` directly. The useful data is already exposed under flat keys on the same response.
- **Risk to remove:** Low — would need to confirm nothing reads `finalizeFast` outside the frontend (e.g. the measure script or test-oxylabs)

### 2. Three frontend reads that reference fields never sent by the server
In `useGuidedSearch.js` lines 425–427:
```js
payload.selection?.reusedCandidateAwarePrior || payload.selection?.reusedPreRankArtifact
payload.selection?.usedIntentMatchRerank
```
The server's `selection` object (server.js ~line 1705) contains: `layer`, `mode`, `strategy`, `model`, `modelPath`, `requestMode`, `shortlistLocked`, `usage`, `selectedCandidateIds`, `details`, `flowPath`.

`reusedCandidateAwarePrior`, `reusedPreRankArtifact`, and `usedIntentMatchRerank` are **never included**. These were fields from the old `selectAiResults` debug path and were not wired up when the nano/mini split replaced it. The reads always evaluate to `false`/`undefined`. The analytics events that use them are silently wrong.

### 3. `badgeLabel: ''` hardcoded in `toFinalizeFastCard()` (layered-contracts.js:85)
- Every card result ships with `badgeLabel: ''`
- The field is read by the frontend (`ProductCard.jsx`, `HomeShared.jsx`, `resultPresentation.js`) but badges are always assigned client-side — the server value is never anything other than empty string
- Could remove the field from `toFinalizeFastCard` and have the frontend initialize it as needed

---

## Medium confidence — needs verification

### 4. Candidate fields sanitized but never rendered
`sanitizeFinalizeCandidate()` in `server.js` carefully preserves these fields through the candidate pool:
`delivery`, `tag`, `extensions`, `attributes`, `trustSignals`, `matchSignals`, `variantTokens`, `duplicateFamilyKey`, `multipleSources`

These are not referenced anywhere in the frontend (`src/`). They may be intentional scaffolding for future features. Worth confirming before removing.

### 5. Full `candidatePool` in discovery response
Frontend reads `payload.candidatePool` (stores it for finalize), `payload.candidatePool.candidates.length` (for analytics). Individual candidate fields inside the discovery candidatePool are not directly rendered — the pool is just passed through to finalize as `originalCandidatePool`. Probably fine to keep since it's the core mechanism, but the full candidate detail depth may be more than needed.

---

## Notes on things that look dead but aren't

- **`debug` object in finalize response** — intentional developer tooling for network inspection, not frontend consumption. Keep it.
- **`/api/search/debug` route** — separate route for inspecting cache state. Active.
- **`selection` object in finalize response** — read by frontend (`payload.selection`), stored as `selectionState`, used to drive retry/analytics logic.
