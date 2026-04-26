# Desktop UI Improvement Suggestions

Captured from review of HomeExperience.jsx, HomeShared.jsx, and ProductCard.jsx.

---

## High Impact

### ~~1. Two-column layout after search starts~~ — ruled out
Already tried and rejected. The flow is sequential (search → refine → results), which reads naturally top-to-bottom. The refinement textarea needs focus and shouldn't compete with a results grid beside it. The single-column approach also fits the calm/focused brand better. The real desktop gaps are #2 and #3 below.

### 2. Page is pinched by its max-widths — partially addressed
Search section is still `max-w-4xl`. Results have been widened to `max-w-[1100px]` and the outer wrapper is now `max-w-7xl`. Whether the results section needs more breathing room at 1440px+ is still a judgment call, but the original `max-w-5xl` pinch is resolved.

### ~~3. No persistent header~~ — already implemented
`SiteLayout.jsx` has a sticky header with logo + nav that collapses on scroll. Not an issue.

---

## Medium Impact

### ~~4. Hero-to-results vertical distance~~ — feels right as-is
Zvi reviewed and prefers the current spacing.

### ~~5. "Show focused picks" / "Just show me results" button pair is awkward~~ — already implemented
Buttons are now side-by-side on desktop (`sm:flex-row sm:justify-between`), with clear visual hierarchy: primary ("Show focused picks") is `h-14` with a blue drop shadow; secondary ("Just show me results") is `h-12` outline. Around lines 696–733 in `HomeExperience.jsx`.

### 6. Product card image area is sparse
Cards use `aspect-square` + `object-contain` + `p-4` padding — at 3 columns on desktop the images feel like thumbnails. Fix: remove padding (`p-0`) and switch to `object-cover`, or add a `min-height` to make images more substantial. In `ProductCard.jsx` around line 89.

---

## Lower Impact / Polish

### ~~7. Results wrapper adds a redundant visual layer~~ — already removed
The `rounded-[32px] border border-white/70 bg-white/72` outer container is gone. Results now sit in a plain `<section className="w-full max-w-[1100px] space-y-4">` with no wrapping layer.

### 8. Retry feedback section could be a bottom bar or side panel
The retry section ("What would make these better?") appears below all results and pushes page length. On desktop it could live as a persistent footer bar or collapsible side panel. In `HomeShared.jsx` around line 545.
