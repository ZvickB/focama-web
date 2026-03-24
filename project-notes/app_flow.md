# Focama App Flow

## Purpose of this file
- This file tracks how the current web app behaves right now.
- It should hold implementation behavior, temporary adaptations, and MVP assumptions.
- Within `project-notes`, `doc_briefs.md` should stay focused on product intent, stack direction, and broader decisions.

## Current app structure
- The site uses React Router with a shared layout shell.
- The shared shell includes the logo, top navigation, footer, and trust pages.
- The current public pages are:
  - Home
  - About
  - Contact
  - Privacy
  - Affiliate Disclosure
- The default homepage is the `open` variant.
- Older homepage UI concepts are archived in `archive/ui-screen-choices-rejects/` and are no longer part of the live app routes.

## Current homepage behavior
- The homepage is the main product experience.
- The user lands on a spacious search-first screen with the wordmark, a central input, and minimal copy.
- After the user submits a product query:
  - the same area expands into the AI refinement state
  - the results area begins shimmering below
  - the refinement step stays visually higher-priority than the skeletons
- The homepage sends the search to the live `/api/search` route.
- After loading/refinement, the page displays up to 6 normalized product cards.
- Clicking a product opens a detail modal with:
  - product image
  - short explanation
  - price and ratings
  - drawbacks/tradeoffs
  - a placeholder CTA for future marketplace linking

## Current MVP assumptions
- Product data comes from the live search backend path rather than a frontend mock catalog.
- The backend now filters candidates and uses AI to improve the final shortlist rather than simply returning the first raw usable results.
- Search history/cache persistence now exists through the storage layer, with Supabase preferred and local fallback for development.
- The product modal CTA is not yet a live affiliate or retailer link.

## Marketplace direction
- Focama is meant to help users narrow choices before going into a retailer marketplace.
- Retailer integration should stay flexible.
- The app should not be tightly designed around one marketplace unless that becomes a stable product decision.
- SerpApi is the current near-term search integration direction.
- Amazon is the current priority for the future free tier because its affiliate program is the strongest likely starting point.
- A paid tier may also use SerpApi more directly to give users a wider range of results.
- Even in the paid tier, vendors with stronger affiliate programs should generally be prioritized over vendors with no program at all.
- Walmart is still worth considering because it has an affiliate path, while vendors with no affiliate option should usually only be shown when the user benefit is clearly meaningful.
- SerpApi is the working integration for now until the search flow is proven and Amazon Creator API access is available.
- The frontend should not be redesigned around SerpApi because it is a temporary integration layer, not the product identity.

## UI principles
- The overall feeling should remain calm, focused, and lower-friction than typical marketplaces.
- The homepage should feel useful and premium on first load, not like a dashboard.
- Mobile-first layout decisions should remain the default.
- Loading states should feel intentional, not abrupt.
- Brand elements like the wordmark, nav, logo, and footer should remain consistent even when homepage content changes.

## Placeholder vs real
- Real now:
  - site shell
  - routing
  - multiple homepage variants
  - open-layout default homepage
  - branding and loading fallback
  - product-card interaction pattern
  - live `/api/search` route
  - AI-assisted shortlist selection
  - Supabase-backed cache/history path
- Placeholder now:
  - outbound retailer links
  - auth flows
  - deeper analytics/observability
  - fully productized persistent user history

## Next likely implementation steps
- Verify the Vercel deployment using the current cache/storage flow.
- Keep tightening weak-result handling and AI judgment quality.
- Decide how outbound retailer links should work in the modal and cards.
- Refine the default open homepage based on tester feedback while keeping alternate variants available for comparison.
