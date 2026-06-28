# Test Suite Audit
_Audited: 2026-05-12_

## Summary

- **20 test files**, roughly 5,900-6,700 total lines depending on line-count method.
- **13 backend** test files, **7 frontend** test files.
- Rough file-count coverage: backend has direct test files for about one third of source files; frontend has direct test files for a smaller slice.
- Treat those percentages as directional only. They are not real statement/branch coverage numbers.

Core business logic (filtering, search flows, storage, and major route behavior) is reasonably covered. The main problems are very large integration-style files, several narrow one-test module files, and missing direct behavior-contract tests for critical backend modules.

Important distinction: some modules listed as gaps below are exercised indirectly through `server.test.js` or provider tests. The gap is usually lack of focused direct tests, not total absence of coverage.

---

## File Inventory

### Backend

| File | Lines | Assessment |
|------|-------|------------|
| `server.test.js` | ~2,070 | Useful broad handler coverage, but too large to navigate; split by endpoint/feature when touching it |
| `result-filter.test.js` | ~491 | High quality; keep as-is |
| `oxylabs-pipeline.test.js` | ~244 | Good; covers provider calls, detail normalization, retry/cache behavior |
| `rate-limit.test.js` | ~213 | Good; covers memory + Supabase backends |
| `search-storage.test.js` | ~213 | Good; covers fallback behavior and product detail cache storage shape |
| `search-data.test.js` | ~160 | Good; normalization and validation edge cases |
| `layered-contracts.test.js` | ~126 | Good; contract structure validation |
| `refinement-assistant.test.js` | ~98 | Moderate; covers happy path and clamping |
| `ai-selector.test.js` | ~79 | Minimal; 1 direct mini-enrichment test only |
| `rainforest-pipeline.test.js` | ~67 | Good for its current scope; domain/currency logic |
| `retry-advice.test.js` | ~63 | Minimal; 1 direct happy-path test |
| `http.test.js` | ~49 | Good for its scope |
| `query-framing.test.js` | ~45 | Minimal; 1 narrow contract/prompt-shape test |

### Frontend

| File | Lines | Assessment |
|------|-------|------------|
| `HomePage.test.jsx` | ~1,990 | Excellent coverage of the main user flow, but monolithic |
| `HomeShared.test.jsx` | ~129 | Good; modal states, enrichment, marketplace |
| `resultPresentation.test.js` | ~75 | Good; badge logic |
| `useGuidedSearch.test.js` | ~56 | Good; hydration + snapshot fallback |
| `ProductCard.test.jsx` | ~41 | Narrow; tests reason filtering, okay for its scope |
| `ErrorBoundary.test.jsx` | ~32 | Good for its scope |
| `App.test.jsx` | ~11 | Narrow; verifies route loading fallback, not full routing behavior |

---

## What Should Be Reworked

**`ai-selector.test.js`** — 1 direct test for feature bullet preservation. This is one of the most important backend modules and needs more direct coverage. Add behavior-contract tests for Haiku lock parsing, duplicate/out-of-pool IDs, malformed model responses, empty pools, partial selections, and enrichment ordering.

**`retry-advice.test.js`** — 1 direct happy-path test. The server-level tests cover some handler failures, but the module itself should cover API failures, malformed/no structured output, normalization, and fallback behavior.

**`query-framing.test.js`** — 1 direct test, one narrow scenario. Either expand it with failure/parse/clamping cases or fold those cases into the refinement-assistant tests if the separate module boundary stops mattering.

**Do not delete `App.test.jsx` just because it is small.** It currently checks the route loading fallback, which is a real UI state. If it changes, replace it with a routing/error-boundary smoke test rather than removing coverage.

---

## What Should Be Split

**`server.test.js`** (~2,070 lines) — too large to navigate or maintain comfortably. Should eventually be broken into per-endpoint/per-route files: one for discovery/cache, one for refine, one for finalize/enrichment, one for retry/feedback/health. Do this opportunistically while changing related behavior, not as a risky standalone churn pass.

**`HomePage.test.jsx`** (~1,990 lines) — similarly large. Could be split by concern: marketplace selection, search flow, refinement/finalize, retry advice, feedback submission.

---

## What Should Be Merged

No urgent merges.

`oxylabs-pipeline.test.js` and `rainforest-pipeline.test.js` test similar provider patterns, but they are different APIs and the current separation is fine. Shared test utilities may help later if provider tests grow.

---

## Critical Direct-Coverage Gaps

### Backend - High Impact

| Module | What it does | Why it matters |
|--------|-------------|---------------|
| `ai-selector.js` | Haiku shortlist lock + mini enrichment | Critical AI boundary; direct tests should protect valid IDs, malformed output, partial output, and ordering |
| `product-details-cache.js` | Product enrichment caching | Direct tests should cover cache hit/miss, partial refresh, async best-effort writes, and provider failures |
| `search-pipeline.js` | Shared pipeline/cache helpers | Central to routes; add tests for cache sanitization, validation, API errors, and badge fallback |
| `retry-advice.js` | Generates retry search advice | Direct tests should cover API failures, malformed output, empty output, normalization, and fallback behavior |

### Backend - Medium Impact

| Module | Notes |
|--------|-------|
| `feedback-handler.js` | Indirectly covered through `server.test.js`; direct handler tests could make future extraction safer |
| `retry-advice-handler.js` | Indirectly covered through `server.test.js`; direct handler tests could reduce reliance on the large server test file |
| `oxylabs-normalizer.js` | Data transformation; add tests if normalizer churn resumes |
| `text-sanitizers.js` | Text normalization; worth testing around request limits/sanitization if reused more broadly |
| `memory-cache.js` | TTL-based caching; low effort if cache behavior starts changing |
| `observability.js` | Logging/reporting setup; probably not worth heavy tests beyond small smoke tests |

### Frontend - Notable Gaps

| Module | Notes |
|--------|-------|
| `SearchProgressContext.jsx` | Used by homepage tests, but no direct provider/state transition tests |
| `formatDisplayPrice.js` | Utility with no tests; easy to add, low effort |
| `HomeExperience.jsx` | Main UI component covered through `HomePage.test.jsx`, but no focused tests |
| `analytics.js`, `feedback.js`, `seo.js` | Utilities with little/no direct coverage |
| `AmazonStorePill.jsx` | Behavior mostly covered through homepage flows; direct component tests could help if picker behavior changes |

---

## Duplication Assessment

Minimal problematic duplication. The main overlaps are acceptable:

- `search-storage.test.js` vs. `search-data.test.js`: different concerns, storage vs. formatting/validation.
- `oxylabs` vs. `rainforest` pipeline tests: different APIs, similar patterns.
- `server.test.js` vs. individual module tests: server tests cover route behavior, while module tests should cover smaller contracts.

No merges are required right now.

---

## Test Philosophy

New tests should make the project easier to change, not harder. Prefer behavior-contract tests over implementation-detail tests.

Avoid locking in:

- exact AI prompt wording
- exact helper call order
- brittle UI copy snapshots
- current provider quirks unless the behavior is intentional
- local storage/file shapes unless they are part of the app contract

Prefer locking in:

- malformed AI output does not crash the flow
- AI-selected IDs must come from the candidate pool
- partial AI output is handled predictably
- missing product details still returns usable results
- stale/unavailable cached data does not leak into user results
- retry advice and feedback handlers fail gracefully
- request/body limits and sanitization stay enforced

---

## Priority Order for Improvements

**Do first - coverage on critical modules:**

1. `ai-selector.test.js` - expand from 1 test to focused behavior-contract coverage for Haiku lock and mini enrichment.
2. `product-details-cache.js` - add direct tests for hit/miss, partial refresh, provider failure, and best-effort writes.
3. `search-pipeline.js` - add direct helper tests for cache sanitization, validation, API failure, and badge fallback.
4. `retry-advice.test.js` - add failure, malformed response, empty response, normalization, and fallback cases.

**Do next - fix the thin tests:**

5. `query-framing.test.js` - expand or absorb into refinement-assistant tests.
6. `feedback-handler.js` + `retry-advice-handler.js` - add direct handler tests if/when splitting `server.test.js`.
7. `App.test.jsx` - keep current fallback test unless replacing it with a broader routing smoke test.

**Do when there is time:**

8. Split `server.test.js` by endpoint.
9. Split `HomePage.test.jsx` by feature area.
10. Add `formatDisplayPrice.js` utility tests.
11. Add direct `SearchProgressContext` tests.
