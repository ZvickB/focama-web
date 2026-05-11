# Homepage First-Load Audit

## Purpose
- Capture the homepage first-load audit findings without changing code yet.
- Give future chats a clear, low-risk sequence for improving cold-load behavior while keeping the current splash timing.

## Guardrails
- Keep the splash timing exactly as it is now.
- Do not spend time on analytics or feedback code for this work. They are not part of the final production direction for this audit plan.
- Focus on reducing what must load before the homepage can become ready under the splash.

## Current boot path
1. `index.html` renders the splash immediately.
2. The browser loads the main app bundle from `src/main.jsx`.
3. React mounts `App`, providers, router, and route shell.
4. The lazy `/` route loads `src/pages/HomePage.jsx`.
5. `HomePage` immediately loads `HomeExperience`.
6. `HomeExperience` immediately pulls in:
   - guided search state and network logic
   - results section UI
   - modal UI
   - retry UI
   - result skeleton UI
   - animation runtime used across the homepage flow
7. `AppRoutes` marks the app ready, then the existing splash delay/fade runs.

## What is currently eager

### Definitely in the initial homepage path
- `src/components/home/HomeExperience.jsx`
- `src/components/home/useGuidedSearch.js`
- `src/components/home/HomeShared.jsx`
- `src/components/ProductCard.jsx`
- `motion/react` used by the homepage shell and later-path UI

### Why that matters
- The homepage first viewport is paying for code that is only needed after search starts or after a result is opened.
- The splash stays visible until the route tree is ready, so every extra homepage dependency increases the chance that a cold visit feels stuck.

## Build snapshot from the audit
- Main app chunk: about `283 kB` raw, `89.6 kB` gzip
- Homepage chunk: about `240 kB` raw, `74.1 kB` gzip

These numbers came from `npm run build` during the audit and are enough to justify splitting the homepage path before touching backend behavior.

## Main findings

### 1. The first viewport and the search/results app are coupled
- `src/pages/HomePage.jsx` renders `HomeExperience` directly.
- `HomeExperience` mixes the simple above-the-fold UI with all guided search, results, modal, and retry behavior.
- This is the biggest structural reason the homepage chunk is heavy.

### 2. Results and modal code are loaded before the user needs them
- `HomeExperience` imports `ProductDetailModal`, `ResultsSection`, and `ResultSkeleton` from `HomeShared` at module load.
- `HomeShared` also brings in `ProductCard`, `Textarea`, modal logic, retry UI, and `motion`.
- None of that is needed just to show the initial search box and hero.

### 3. Guided search logic is eager even before submit
- `useGuidedSearch` is mounted on first render.
- That hook includes discovery, refine, finalize, enrichment polling/SSE, retry advice, and result analytics wiring.
- Even when it does not fire network requests immediately, it still increases the amount of code needed before the homepage is ready.

### 4. Motion code is part of the initial path
- The initial hero and several later-path surfaces use `motion/react`.
- That means the first load pays for animation code that is mostly useful after search starts or when the modal opens.

### 5. The splash timing is not the root cause
- The fixed splash timing can stay.
- The real issue is that the app becomes ready too late underneath it on cold loads.

## Recommended split across chats

### Chat 1: split the homepage shell from the guided app
Goal:
- Keep the same visual homepage and the same splash timing.
- Make the first viewport much lighter by loading only the search-first shell at boot.

Files to touch:
- `src/pages/HomePage.jsx`
- `src/components/home/HomeExperience.jsx`
- likely add a new shell component such as `src/components/home/HomeShell.jsx`
- possibly a new deferred experience component such as `src/components/home/HomeGuidedExperience.jsx`

What this chat should do:
- Move the above-the-fold hero, wordmark, input, and submit UI into a light shell component.
- Delay loading the full guided search experience until the user starts a search.
- Keep the existing splash timing unchanged in `src/App.jsx`.

Why this goes first:
- It should unlock the largest improvement with the cleanest architectural boundary.

### Chat 2: split later-path UI from the active search flow
Goal:
- Stop loading results, modal, retry UI, and heavy animation code before those states exist.

Files to touch:
- `src/components/home/HomeExperience.jsx`
- `src/components/home/HomeShared.jsx`
- `src/components/ProductCard.jsx`
- likely add focused files such as:
  - `src/components/home/ResultsSection.jsx`
  - `src/components/home/ProductDetailModal.jsx`
  - `src/components/home/ResultSkeleton.jsx`

What this chat should do:
- Break `HomeShared.jsx` apart.
- Lazy-load `ResultsSection` after search starts.
- Lazy-load `ProductDetailModal` only when a product is selected.
- Keep `ResultSkeleton` lightweight and separate.
- Move `motion/react` out of the initial homepage shell if possible.

Why this is second:
- It is safer after the homepage shell boundary already exists.

### Chat 3: cleanup and re-measure
Goal:
- Verify that the split actually reduced initial cost and remove any leftover coupling.

Files to touch:
- `src/pages/HomePage.jsx`
- `src/components/home/HomeExperience.jsx`
- `src/components/home/useGuidedSearch.js`
- `src/App.jsx` only if a tiny readiness cleanup is needed without changing splash timing
- `project-notes/current-status.md`
- `project-notes/session-handoff.md`
- `project-notes/app_flow.md` if the boot/loading behavior changed enough to document

What this chat should do:
- Run `npm run build` again and compare chunk sizes.
- Clean up imports and any transitional glue from chats 1 and 2.
- Confirm the splash timing is unchanged.
- Update notes to reflect the new homepage boot architecture.

## Not in scope for this plan
- Analytics cleanup
- Feedback FAB cleanup
- Backend prewarm changes
- Search flow product decisions
- Rewriting splash timing

## File references from the audit
- `index.html`
- `src/main.jsx`
- `src/App.jsx`
- `src/pages/HomePage.jsx`
- `src/components/home/HomeExperience.jsx`
- `src/components/home/HomeShared.jsx`
- `src/components/home/useGuidedSearch.js`
- `src/components/ProductCard.jsx`
- `src/components/SiteLayout.jsx`
- `src/contexts/AmazonStoreContext.jsx`
