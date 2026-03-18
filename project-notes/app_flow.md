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

## Current homepage behavior
- The homepage is the main product demo.
- The user enters:
  - a product topic
  - extra context about the shopper or use case
- On submit, the page shows a short loading state with skeleton cards.
- The homepage sends the search to the live `/api/search` route.
- After the loading state, the page displays up to 4 normalized live product cards from SerpApi.
- Clicking a product opens a detail modal with:
  - product image
  - short explanation
  - price and ratings
  - a placeholder CTA for future marketplace linking

## Current MVP assumptions
- Product data now comes from the live search backend path rather than a frontend mock catalog.
- Ratings, prices, descriptions, and images are still raw normalized search results rather than AI-filtered picks.
- Search history is UI-only for now.
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
- The homepage should feel useful even before live integrations are added.
- Mobile-first layout decisions should remain the default.
- Loading states should feel intentional, not abrupt.
- Brand elements like the logo, nav, and footer should remain consistent even when homepage content changes.

## Placeholder vs real
- Real now:
  - site shell
  - routing
  - homepage UI structure
  - branding
  - product-card interaction pattern
  - live `/api/search` route for raw SerpApi results
- Placeholder now:
  - product ranking logic
  - retailer links
  - persistent history
  - auth flows
  - Vercel deployment verification

## Next likely implementation steps
- Verify the Vercel deployment using the new server-function route shape.
- Keep returning the first 4 usable live results directly to the frontend before adding AI filtering.
- After the raw search pipeline works, add AI ranking/filtering on top of a larger result set.
- Add persistence for search history if it still fits the product direction.
- Decide how outbound retailer links should work in the modal and cards.
