# Focama
intent: an app where the user can enter a product description and receive a calmer, more focused shopping shortlist before heading into a retailer marketplace.
purpose: Large marketplaces are designed to be sticky and distracting. Focama is meant to reduce that friction by helping users move toward the item they want without the usual noise. This is especially relevant for users who care about focus and who may also want to avoid the general browsing environment of major marketplaces.

## Amazon compliance notes
- Use the exact Amazon Associates website disclosure text somewhere clear on the site once Amazon affiliate linking is live: `As an Amazon Associate I earn from qualifying purchases.`
- Keep the disclosure clear and conspicuous, not hidden in a footer-only placement or buried in legal text.
- Put a disclosure near affiliate CTAs / affiliate links as well, since Amazon expects disclosures to be adjacent to where users engage with the link.
- If social/account surfaces are added later, add the required affiliate disclosure in the associated profile/account context too.
- If live Amazon pricing, availability, discounts, or Prime-related data are shown later, verify and add any additional adjacent Amazon-required disclaimers for that content before launch.
- Before connecting any live Amazon affiliate or product integration, re-check Amazon's latest Operating Agreement and help docs because these requirements can change.
- Future UX and copy decisions should preserve trust and compliance: no misleading wording that could hide the affiliate relationship.

## Flow of app
1. The user arrives on a spacious, search-first homepage.
2. The user enters a product topic in the main input.
3. The interface expands into an AI refinement state while the shortlist begins taking shape below.
4. The backend queries SerpApi, filters a larger candidate set, and uses AI where helpful to improve the final shortlist.
5. The frontend returns a focused set of up to 6 results.
6. Eventual affiliate or retailer linking can be added once the search and filtering flow is stable.

## UI direction
- The overall feeling should be calm, focused, and lower-noise than Amazon or other marketplaces.
- UI decisions should be mobile-first. Small-screen layout and usability should be the default starting point, then expand upward for tablet/desktop.
- The current preferred direction is the `open` homepage layout:
  - spacious
  - minimal copy
  - one strong central input
  - refinement area revealed after search
  - skeletons still visible, but not the primary focus
- Prefer the PNG wordmark for now rather than forcing an SVG recreation that feels off-brand.

## Stack
- Current stack: React, Vite, Tailwind, React Router, TanStack Query, Supabase, Vercel API routes, Vitest.
- Deploy on Vercel.
- Supabase is used for cache plus operational history storage when configured, with local fallback for development resilience.
- The current `search_history` path is internal telemetry, not a user-facing saved-history feature.
- Once the MVP is stable, a future React Native version is plausible, especially using the open-layout flow as the starting point.

## Current implementation direction
- Keep the default homepage on the `open` layout while continuing to polish it.
- Do not remove the alternate UI variants yet.
- Keep the product vendor-agnostic in both UX and backend structure so different search/data providers can support different tiers over time.
- The frontend and normalized backend response shape should belong to Focama rather than to any one provider.
- The site may eventually point users to Amazon or Walmart, so the frontend should stay flexible for those destinations.
- SerpApi is the practical interim data source until the product flow is working and Amazon Creator API approval is in place.
- SerpApi may still remain part of the product later for broader paid-tier search, so it should be treated as a provider option rather than as the identity of the app.
- The current live search flow is:
  - query SerpApi
  - filter a larger candidate pool with rules
  - let AI improve the final shortlist using the user’s context as the main fit signal
  - render up to 6 results in the current UI
- If local cache or saved query/evaluation data is used during development, treat it as temporary only and plan to remove or replace it later rather than letting it become accidental product infrastructure.
- The rule-based filter should mainly discard junk and weak candidates. User context is the main reason to use AI, with ratings/reviews acting as supporting quality signals rather than replacing contextual fit.
- Avoid overengineering.

## Workflow preference
- For small UI or copy changes, prefer using the dev server and manual verification instead of running `npm run build` every time.
- Reserve `npm run build` for significant changes, routing/layout changes, dependency changes, or meaningful checkpoints before handoff.
- Write tests where they meaningfully reduce risk, protect important behavior, or save time during future changes.
- Do not add tests for every small presentational change. Prefer tests where they give real protection, confidence, or faster iteration.
- This repo should be treated as a PowerShell environment. Prefer PowerShell-safe commands and avoid Bash-style `&&` chaining.
- Use `project-notes/app_flow.md` for the current implemented user flow and `project-notes/current-status.md` for the immediate project snapshot.

## To do
- Decide how affiliate/outbound retailer links should appear in cards and product detail surfaces.
- Keep refining the open homepage based on tester behavior.
