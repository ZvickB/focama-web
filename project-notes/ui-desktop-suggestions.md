# Desktop UI Improvement Suggestions

Captured from review of HomeExperience.jsx, HomeShared.jsx, and ProductCard.jsx.

---

## High Impact

### ~~1. Two-column layout after search starts~~ — ruled out
Already tried and rejected. The flow is sequential (search → refine → results), which reads naturally top-to-bottom. The refinement textarea needs focus and shouldn't compete with a results grid beside it. The single-column approach also fits the calm/focused brand better. The real desktop gaps are #2 and #3 below.

### 2. Page is pinched by its max-widths
`max-w-4xl` for search, `max-w-5xl` for results — on a 1440px monitor this leaves ~400px of dead space on each side. Bumping results to `max-w-6xl` or `max-w-7xl` would let the 3-column card grid breathe. Relevant in `HomeExperience.jsx` (the `OpenLayout` component).

### ~~3. No persistent header~~ — already implemented
`SiteLayout.jsx` has a sticky header with logo + nav that collapses on scroll. Not an issue.

---

## Medium Impact

### ~~4. Hero-to-results vertical distance~~ — feels right as-is
Zvi reviewed and prefers the current spacing.

### 5. "Show focused picks" / "Show products now" button pair is awkward
Currently stacked vertically with a hint below the second one. On desktop they'd work better as equal-weight side-by-side buttons with clear hierarchy — primary on the left, secondary on the right. Currently around lines 544–575 in `HomeExperience.jsx`.

### 6. Product card image area is sparse
Cards use `aspect-square` + `object-contain` + `p-4` padding — at 3 columns on desktop the images feel like thumbnails. Fix: remove padding (`p-0`) and switch to `object-cover`, or add a `min-height` to make images more substantial. In `ProductCard.jsx` around line 89.

---

## Lower Impact / Polish

### 7. Results wrapper adds a redundant visual layer
Results live inside a `rounded-[32px] border border-white/70 bg-white/72` container, but each card already has its own styling. On desktop the outer container just adds visual nesting. Removing it would feel cleaner. In `HomeExperience.jsx` around lines 613–638.

### 8. Retry feedback card could be a bottom bar or side panel
The "Didn't find anything you like?" card appears below all results and pushes page length. On desktop it could live as a persistent footer bar or collapsible side panel. In `HomeShared.jsx` around lines 536–584.
