# Current Status

## Purpose
- This file is a short handoff for future chats and AI agents.
- It should capture the current implementation direction, active constraints, and immediate next step.
- Keep this file brief and update it whenever a meaningful decision changes.

## Current state
- The frontend is built in Vite + React with React Router, TanStack Query, and Tailwind.
- The homepage UI is already in place with a search form, loading skeletons, result cards, and a product detail modal.
- Product results now come from a live `/api/search` route that is shaped to work both locally and as a Vercel function.
- A separate cache route still exists for debugging and temporary local fallback work, but the homepage now uses the live search path.
- The live search path now:
  - validates input
  - queries SerpApi
  - filters a larger candidate pool
  - uses AI to choose the final 4 cards
  - includes drawbacks/tradeoffs in the result data
- Basic IP-based rate limiting now exists on `/api/search` to reduce abuse risk.
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
- The main goal is now to keep improving result quality, AI judgment, and deployment safety without changing the calm 4-card UX.
- The frontend and backend response shape should stay vendor-agnostic even if different providers support different tiers later.
- Amazon is the likely future priority for the free tier because it has the strongest affiliate opportunity.
- SerpApi may remain useful later for a paid tier that offers broader search coverage.
- Walmart is still worth considering because it has an affiliate path, while vendors with no affiliate option should usually only be shown when the user benefit is strong.
- Work with SerpApi for now until the search pipeline is working and Amazon Creator API access is approved.

## Current backend plan
1. Read `SERPAPI_API_KEY` from the root `.env`.
2. Read `OPENAI_API_KEY` from the root `.env`.
3. Query SerpApi through the live `/api/search` route.
4. Use rules to discard junk, duplicates, and weak candidates without treating rules as the final selector.
5. Keep a larger cleaned candidate pool and send it to AI for final selection of 4 cards.
6. Use the textarea context/details as the main fit signal, with ratings/reviews as supporting quality signals.
7. Keep the cache tooling available only as a debugging aid.
8. Keep basic rate limiting in place and strengthen abuse protection later if usage grows.

## Important scope constraints
- Do not do a major UI redesign for SerpApi.
- Do not reshape the frontend around SerpApi-specific branding or assumptions.
- Do not add extra architecture unless it is needed to complete the working slice.
- Keep the implementation easy to debug so failures can be isolated between frontend, backend, and SerpApi response mapping.

## Environment notes
- The SerpApi key should live in the root `.env` as `SERPAPI_API_KEY=...`.
- The OpenAI key should live in the root `.env` as `OPENAI_API_KEY=...`.
- The OpenAI model can optionally be overridden with `OPENAI_MODEL=...`.
- The `.env` file is ignored by git.
- This project is being worked in PowerShell on Windows.

## Recommended next task
- Verify the latest Vercel deployment end to end, then keep tightening AI prompt quality, weak-result handling, and abuse protection while preserving vendor-agnostic boundaries.
