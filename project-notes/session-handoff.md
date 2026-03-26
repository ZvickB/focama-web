# Session Handoff

## What this file is for
- This is the short handoff summary for starting a fresh Codex chat.
- It is separate from `handoff.md`, which is still useful as the broader MVP/status tracker.
- In a new chat, you can say: "Please read `project-notes/session-handoff.md` first."

## Current homepage direction
- The default homepage at `/` now uses the `open` layout variant.
- Older UI variants were removed after the open layout direction was chosen.
- The current product direction is the spacious, search-first open layout rather than the older split-screen or chip-heavy flows.

## Important files
- Main app routes and loading fallback: `/src/App.jsx`
- Active homepage layout: `/src/components/home/HomeExperience.jsx`
- Shared homepage UI blocks: `/src/components/home/HomeShared.jsx`
- Shared guided-search logic/state: `/src/components/home/useGuidedSearch.js`
- Site header/nav/logo usage: `/src/components/SiteLayout.jsx`
- Default homepage route file: `/src/pages/HomePage.jsx`

## Current UI state
- `/` is the `open` variant.
- The open layout is intentionally more minimal and mobile-friendly.
- The homepage hero in the open layout now uses the PNG wordmark instead of plain `Focamai` text.

## Brand assets
- Master logo: `/src/assets/logo_master_version.svg`
- Sharper small header logo: `/src/assets/logo_header_mark.svg`
- PNG wordmark currently preferred by user: `/src/assets/wordmark.PNG`
- Attempted SVG wordmark exists but user did not like it: `/src/assets/wordmark.svg`

## Loading / fallback state
- A true boot splash now starts from `/index.html`, so slow or throttled loads show branding before React finishes loading
- It shows the PNG wordmark plus the line `Focused shopping`
- It fades away only after the app is ready and the splash has been visible for about 1 second total
- The boot splash now includes a static header shell to keep the hero closer to the real homepage position during handoff

## Search/result behavior
- Shortlist count is now 6 end-to-end, not 4
- This was updated in both frontend and backend logic
- The homepage now uses the guided flow:
  - `/api/search/discover` for the candidate pool and preview set
  - `/api/search/refine` for the AI follow-up prompt
  - `/api/search/finalize` for the final shortlist
- This guided flow is the primary backend architecture for the homepage
- `/api/search/live` is the explicit manual/debug combined route
- The Vercel route wrappers now preserve forwarded request headers so backend IP-based rate limiting still works in production deployments
- Guided `/api/search/finalize` now rejects oversized or malformed payloads before AI selection and caps candidate pool size at 20
- Guided `/api/search/discover` now returns a lightweight `discoveryToken` tied to the cached guided candidate pool
- Guided `/api/search/finalize` now accepts lightweight finalize context and rebuilds the rich candidate pool server-side from guided discovery cache before AI selection
- The browser no longer needs to POST the full rich guided candidate pool back to `/api/search/finalize`
- Guided `/api/search/finalize` body limit is back to 32 KB now that the finalize payload is lightweight again
- `/api/search/debug` should be read as guided-primary debug output, with `/api/search/live` treated as the manual combined route
- `/api/health/supabase` now reports local fallback as a supported state when Supabase is not configured
- Supabase-backed guided discovery cache is now confirmed working in production on `focama.vercel.app`
- Guided `/api/search/finalize` and `/api/search/live` remain intentionally uncached
- Open layout behavior:
  - centered hero
  - search input first
  - refinement area expands after submit
  - `Start a new search` resets the homepage back to a clean blank search state
  - final results now include a `Didn't find anything you like? Tell us why.` retry path
  - retrying requires feedback and is capped at 2 follow-up retries
  - retrying excludes the previously rejected shortlist from reselection
  - earlier rejected shortlists collapse into a `Previous picks` section after a retry
  - scroll transitions between refinement and results should move once without overshooting
  - pressing `Show focused picks` now scrolls to the results region immediately and shows skeletons while final AI selection runs
  - no chips
  - `Show products now` stays disabled until discovery is ready
  - skeletons show in a 2x3 layout and only peek into view

## Header/logo notes
- The header uses a separate sharper SVG logo asset for small-size display
- The richer master logo is still kept for larger/fancier contexts
- User noticed the original master logo looked softer on-site because the header version was small and inside extra chrome

## Testing state
- In the latest backend cleanup pass:
  - `npm test -- backend/server.test.js` passed
  - `npm test -- api/search/routes.test.js` passed

## Recent user preferences
- Prefer minimal copy in the open layout
- Prefer no chips in the open layout
- Prefer the PNG wordmark for now rather than forcing a bad SVG recreation
- Want the app to stay production-minded but not overengineered too early

## Strategic context
- User is thinking about:
  - future Next.js migration
  - possible future React Native app using the open layout theme
  - unit economics of search/API costs
  - caching as the major early cost-reduction lever

## If continuing from here
- First inspect `/src/components/home/HomeExperience.jsx`
- Then inspect `/src/App.jsx` and `/src/components/SiteLayout.jsx`
- Treat `wordmark.PNG` as the preferred current wordmark asset unless the user explicitly wants another attempt
