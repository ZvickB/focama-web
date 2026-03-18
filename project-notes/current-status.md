# Current Status

## Purpose
- This file is a short handoff for future chats and AI agents.
- It should capture the current implementation direction, active constraints, and immediate next step.
- Keep this file brief and update it whenever a meaningful decision changes.

## Current state
- The frontend is built in Vite + React with React Router and Tailwind.
- The homepage UI is already in place with a search form, loading skeletons, result cards, and a product detail modal.
- Product results now come from a live `/api/search` route that is shaped to work both locally and as a Vercel function.
- A separate cache route still exists for debugging and temporary local fallback work, but the homepage now uses the live search path.
- The app has had a light optimization pass:
  - route-based lazy loading
  - removal of unused large PNG assets
  - lazy-loaded product card images
  - header scroll behavior smoothed
- Vitest is set up with backend and homepage flow tests.
- Lighthouse on the local production build was strong:
  - Performance 99
  - Accessibility 94
  - Best Practices 100
  - SEO 92

## Active product decisions
- Do not redesign the UI right now.
- Keep the current 4-result card layout and existing homepage flow.
- Avoid overengineering and prefer the simplest vertical slice first.
- The main goal is to prove the search pipeline works end to end.
- The frontend and backend response shape should stay vendor-agnostic even if different providers support different tiers later.
- Amazon is the likely future priority for the free tier because it has the strongest affiliate opportunity.
- SerpApi may remain useful later for a paid tier that offers broader search coverage.
- Walmart is still worth considering because it has an affiliate path, while vendors with no affiliate option should usually only be shown when the user benefit is strong.
- Work with SerpApi for now until the search pipeline is working and Amazon Creator API access is approved.

## Current backend plan
1. Read `SERPAPI_API_KEY` from the root `.env`.
2. Query SerpApi through the live `/api/search` route.
3. Return the first 4 usable live results to the frontend.
4. Keep the cache tooling available only as a debugging aid.
5. Only after the raw pipeline is stable, add AI filtering/reranking.

## Important scope constraints
- Do not add AI filtering yet.
- Do not do a major UI redesign for SerpApi.
- Do not reshape the frontend around SerpApi-specific branding or assumptions.
- Do not add extra architecture unless it is needed to complete the working slice.
- Keep the implementation easy to debug so failures can be isolated between frontend, backend, and SerpApi response mapping.

## Environment notes
- The SerpApi key should live in the root `.env` as `SERPAPI_API_KEY=...`.
- The `.env` file is ignored by git.
- This project is being worked in PowerShell on Windows.

## Recommended next task
- Verify the Vercel deployment end to end, then keep tightening the raw search pipeline while preserving vendor-agnostic boundaries.
