# Focama Cleanup Audit
_Generated: 2026-04-14_

---

## Repo Structure

| # | Item | Description | Status |
|---|------|-------------|--------|
| 1 | Delete `focama-web-intended/` | Stale snapshot clone of `web/` frozen at commit `0cd59eb`. Never developed further. All its code exists in `web/` plus 8 more commits. | done |
| 2 | Delete `focama-web-main.zip` | Old archive zip (395 KB) from an even earlier version of the project. No longer needed. | done |
| 3 | Clean up `web-ui-experiment/` worktree | Orphaned git worktree hanging off `web/.git`. Run `git worktree remove web-ui-experiment` from inside `web/`. | done |
| 4 | Resolve uncommitted changes in `web/` | `web/` has unstaged changes. Either commit them or discard them so the repo is clean. Left pending intentionally because the worktree contains active local edits and untracked files that should not be auto-committed or discarded without your direction. | pending |

---

## Inside `web/` — Assets

| # | Item | Description | Status |
|---|------|-------------|--------|
| 5 | Delete `src/assets/archive/wordmark-previous.PNG` | Old wordmark image. Not imported anywhere. | done |
| 6 | Delete `src/assets/archive/new_wordmark-original-with-bg.png` | Earlier logo iteration. Not imported anywhere. | done |

---

## Inside `web/` — Code

| # | Item | Description | Status |
|---|------|-------------|--------|
| 7 | Decide on `FontComparisonPage.jsx` | Internal design reference page at route `/font-comparison`. Not a real product page. Keep intentionally or remove. Removed from routing and deleted. | done |
