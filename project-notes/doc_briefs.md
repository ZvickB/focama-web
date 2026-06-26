# Focamai
intent: an app where the user can enter a product description and receive a calmer, more focused shopping shortlist before heading out to shop.
purpose: Large marketplaces are sticky and distracting. Focamai should help users narrow choices before they get pulled into that environment.

## Flow of app
1. The user lands on a spacious, search-first homepage.
2. The user enters the product they are actually looking for.
3. Discovery and one AI follow-up question run in parallel.
4. The backend builds and caches a cleaned candidate pool through the Rainforest-named discovery route, with Rainforest API as the active Amazon discovery provider.
5. The user can either view the preview set immediately or ask Focamai to narrow to 6 picks.
6. Finalize locks 6 winners with haiku, returns cards quickly, then async enrichment fills in modal reasoning afterward.
7. If the picks feel wrong, the retry path suggests a better next search query rather than turning the app into an endless marketplace browser.

## UI direction
- The product should feel calm, focused, and lower-noise than Amazon or other marketplaces.
- Mobile-first decisions remain the default.
- The current preferred direction is the `open` homepage layout:
  - spacious
  - minimal copy
  - one strong central input
  - refinement revealed after search
  - skeletons visible, but secondary to the search/refine experience
- Prefer the PNG wordmark for now rather than forcing an SVG recreation that feels off-brand.

## Current implementation direction
- Keep the default homepage on the `open` layout while continuing to polish it.
- Amazon is the current primary commerce path and affiliate target. Frontend copy and UI may say Amazon directly when the active source is Amazon and doing so improves clarity, trust, or conversion.
- Keep backend/provider logic, normalized product data, and search flow reasonably provider-flexible so another source can be added or swapped later.
- Do not force generic `retailer` labels in the current Amazon-first UX, and do not let future multi-retailer flexibility make today's frontend vague.
- Keep the product path centered on guided discovery, short AI refinement, shortlist lock, and later enrichment.
- Keep persistent caching focused on discovery and reusable product-detail infrastructure, not on storing finalized shortlists as product memory.
- Avoid overengineering before v1 usage justifies it.

## Stack and deployment
- Frontend: React, Vite, Tailwind, React Router, TanStack Query.
- Backend: Node/Express on Render.
- Storage/analytics: Supabase when configured, with local fallback for development where supported.
- `api/geo.js` intentionally remains on Vercel so the UI can read Vercel geolocation headers and resolve an explicit Amazon domain before guided requests.

## Amazon compliance notes
- Use the exact Amazon Associates website disclosure text somewhere clear on the site once Amazon affiliate linking is live: `As an Amazon Associate I earn from qualifying purchases.`
- Keep the disclosure clear and conspicuous, not buried in footer-only legal text.
- Put a disclosure near affiliate CTAs or affiliate links once those become real user-facing behavior.
- Before connecting live Amazon affiliate or pricing/availability surfaces, re-check Amazon's latest agreement and help docs because those requirements can change.
- Preserve trust in copy and UX; do not hide the affiliate relationship.

