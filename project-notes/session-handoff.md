# Session Handoff

## What this file is for
- This is the short handoff summary for starting a fresh Codex chat.
- It is separate from `handoff.md`, which is still useful as the broader MVP/status tracker.
- In a new chat, you can say: "Please read `project-notes/session-handoff.md` first."

## Current homepage direction
- The default homepage at `/` now uses the `open` layout variant.
- Other UI variants are still preserved on separate routes for comparison.
- The current product direction is the spacious, search-first open layout rather than the older split-screen or chip-heavy flows.

## Important files
- Main app routes and loading fallback: `/src/App.jsx`
- Homepage variant layouts: `/src/components/home/HomeExperience.jsx`
- Shared homepage UI blocks: `/src/components/home/HomeShared.jsx`
- Shared guided-search logic/state: `/src/components/home/useGuidedSearch.js`
- Site header/nav/logo usage: `/src/components/SiteLayout.jsx`
- Default homepage route file: `/src/pages/HomePage.jsx`

## Current UI state
- `/` is the `open` variant.
- Other routes still exist:
  - `/ui/hero`
  - `/ui/flow`
  - `/ui/concierge`
  - `/ui/instant`
  - `/ui/open`
- The open layout is intentionally more minimal and mobile-friendly.
- The homepage hero in the open layout now uses the PNG wordmark instead of plain `Focama` text.

## Brand assets
- Master logo: `/src/assets/logo_master_version.svg`
- Sharper small header logo: `/src/assets/logo_header_mark.svg`
- PNG wordmark currently preferred by user: `/src/assets/wordmark.PNG`
- Attempted SVG wordmark exists but user did not like it: `/src/assets/wordmark.svg`

## Loading / fallback state
- Route fallback in `/src/App.jsx` no longer says `Loading page...`
- It now shows the PNG wordmark plus the line `Focused shopping`
- This is just for first-load route fallback during lazy loading

## Search/result behavior
- Shortlist count is now 6 end-to-end, not 4
- This was updated in both frontend and backend logic
- Open layout behavior:
  - centered hero
  - search input first
  - refinement area expands after submit
  - no chips
  - `Show products now` stays disabled until discovery is ready
  - skeletons show in a 2x3 layout and only peek into view

## Header/logo notes
- The header uses a separate sharper SVG logo asset for small-size display
- The richer master logo is still kept for larger/fancier contexts
- User noticed the original master logo looked softer on-site because the header version was small and inside extra chrome

## Testing state
- At the end of this session:
  - `npm run test` passed
  - `npm run lint` passed

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
