# Current Status

## Purpose
- This file is a short handoff for future chats and AI agents.
- It should capture the current implementation direction, active constraints, and immediate next step.
- Keep this file brief and update it whenever a meaningful decision changes.

## Current state
- The frontend is built in Vite + React with React Router and Tailwind.
- The homepage UI is already in place with a search form, loading skeletons, result cards, and a product detail modal.
- Product results now come from a backend route that reads a saved SerpApi cache for the current MVP flow.
- A live SerpApi route also exists for direct fetches when needed, but the main homepage currently uses the saved cache route.
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
- The frontend should stay marketplace-agnostic in structure even though Amazon and Walmart are likely future destinations.
- Work with SerpApi for now until the search pipeline is working and Amazon Creator API access is approved.

## Current backend plan
1. Read `SERPAPI_API_KEY` from the root `.env`.
2. Save a small SerpApi response sample to the local cache for the current query.
3. Return the first 4 usable cached results to the frontend.
4. Keep the direct live route available for debugging and future progression.
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
- Keep tightening the raw search pipeline and decide when to move the homepage from cached results to the live route by default.
