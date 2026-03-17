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
- After the loading state, the page displays a mocked set of product cards.
- Clicking a product opens a detail modal with:
  - product image
  - short explanation
  - price and ratings
  - a placeholder CTA for future marketplace linking

## Current MVP assumptions
- Product data is mocked in the frontend for now.
- Ratings, prices, descriptions, and images are placeholders.
- Search history is UI-only for now.
- The product modal CTA is not yet a live affiliate or retailer link.

## Marketplace direction
- Focama is meant to help users narrow choices before going into a retailer marketplace.
- Retailer integration should stay flexible.
- The app should not be tightly designed around one marketplace unless that becomes a stable product decision.
- SerpApi is the current near-term search integration direction.
- Amazon and Walmart are still likely long-term marketplace destinations.
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
- Placeholder now:
  - search results source
  - SerpApi integration
  - product ranking logic
  - retailer links
  - persistent history
  - backend and auth flows

## Next likely implementation steps
- Add a backend route that queries SerpApi.
- Return the first 4 usable results directly to the frontend before adding AI filtering.
- After the raw search pipeline works, add AI ranking/filtering on top of a larger result set.
- Add persistence for search history if it still fits the product direction.
- Decide how outbound retailer links should work in the modal and cards.
