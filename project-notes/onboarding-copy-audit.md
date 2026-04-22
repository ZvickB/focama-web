# Onboarding Copy & UX Audit

**Priority:** Very high — new users are not understanding the flow or what to do.  
**Status:** Ready for implementation — all changes below are finalized and pending implementation.

---

## The Core Problem

The flow has three distinct steps (search → add context → get focused picks) but new users don't know that when they land. The page looks like a search engine. They type something, hit enter — and then it expands, asks a follow-up question, shows preview cards, and presents two buttons. Too much to parse without a mental model upfront.

---

## Finalized Copy Changes

| Location | Old | New |
|---|---|---|
| Hero subline | "From too many choices to yours" | "Tell us what you need. We'll find your six." |
| 3-step indicator | *(none — new element)* | `Search · Refine · Get 6 picks` |
| Refinement eyebrow pill | "A little more context" | "The more you share, the better the picks" |
| Skip button label | "Show products now" | "Just show me results" |
| Skip button sub-label | "Jump straight to results — no extra step needed." | "No AI refinement — results based on your search only." |
| Primary button sub-label | *(none — new addition)* | "Best results — takes ~5 more seconds" |
| Results body copy | "These picks were finalized after your guided refinement. You now have six focused options." | "Six picks, chosen around what you told us." |
| Modal subline | "A closer look at this recommendation." | "What works for you, and what to know." |

---

## Implementation Map

### `src/components/home/HomeExperience.jsx`

**1. Hero subline** — line 12
```js
// Current:
const HERO_SUBLINE = 'From too many choices to yours'
// Change to:
const HERO_SUBLINE = 'Tell us what you need. We\'ll find your six.'
```

---

**2. Search box helper text** — lines 434–435
```jsx
// Current:
Start with the product search you&apos;d normally type into Google. Use the next
step for budget, size, comfort, style, or other must-haves.
// Change to:
Just the product for now — budget, size, and other details come next.
```

---

**3. Refinement eyebrow pill** — line 121
```jsx
// Current:
A little more context
// Change to:
The more you share, the better the picks
```

---

**4. Refinement textarea label** — line 449
```jsx
// Current:
Add details to narrow the search
// Change to:
Your answer
```
⚠️ **Test impact** — `HomePage.test.jsx` uses `getByLabelText(/add details to narrow the search/i)` in many tests (lines 303, 382, 607, 786, 876, 1054). Update every matching `getByLabelText` call to match the new label text.

---

**5. Skip button label** — line 503
```jsx
// Current:
Show products now
// Change to:
Just show me results
```

---

**6. Skip button sub-label** — line 506
```jsx
// Current:
Jump straight to results — no extra step needed.
// Change to:
No AI refinement — results based on your search only.
```

---

**7. Primary button sub-label — new addition**
Add a sub-label below "Show focused picks" mirroring the skip button sub-label pattern:
```
Best results — takes ~5 more seconds
```

---

### `src/components/home/HomeShared.jsx`

**8. Results section body copy** — line 341
```jsx
// Current:
'These picks were finalized after your guided refinement. You now have six focused options.'
// Change to:
'Six picks, chosen around what you told us.'
```

---

**9. Product modal subline** — line 140
```jsx
// Current:
A closer look at this recommendation.
// Change to:
What works for you, and what to know.
```

---

**Keep as-is:**
- "Why this pick stands out" — on-brand, honest
- "Possible drawbacks" — on-brand, honest
- `Focused picks for "${submittedQuery}"` heading — fine as-is

---

## New Element — Step Indicator

### What it is
A `Search · Refine · Get 6 picks` indicator that sits above the search box and stays visible throughout the entire flow. The active step is highlighted in primary blue; inactive steps are muted grey. The separator dots `·` are always muted grey.

### Where to add it
`src/components/home/HomeExperience.jsx` — above the search box, below the hero subline.

### Step state logic
Map to existing state from `useGuidedSearch.js` — no new state needed:

| Step | Active when |
|------|------------|
| Search (step 1) | `!state.hasDiscoveryResults` |
| Refine (step 2) | `state.hasDiscoveryResults && !state.hasFinalResults` |
| Get 6 picks (step 3) | `state.hasFinalResults` |

### Visual spec
- Active step: primary blue (`text-primary`)
- Inactive steps: muted grey (`text-slate-400`)
- Separator dots: always muted grey (`text-slate-300`)
- Font: small, semibold, uppercase tracking — consistent with existing eyebrow pill style
- No background, no border — plain inline text indicator

---

## Files to Change (summary)

| File | What changes |
|------|-------------|
| `src/components/home/HomeExperience.jsx` | `HERO_SUBLINE`, helper text, eyebrow pill, textarea label, button labels + sub-labels, step indicator (new element) |
| `src/components/home/HomeShared.jsx` | Results body copy, modal subline |
| `src/pages/HomePage.test.jsx` | Update `getByLabelText` calls if textarea label changes |

---

## Test impact summary

Changing the textarea label (item 4) is the only copy change that breaks tests. All other changes are purely visual and test-safe. If you want to ship everything else first and handle the label + test update separately, that is safe to do.
