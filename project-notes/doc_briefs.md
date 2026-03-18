# Focama
intent: an app where the user can enter a product description and receive a small set of calmer, more focused shopping choices before heading into a retailer marketplace.
purpose: Large marketplaces are designed to be sticky and distracting. Focama is meant to reduce that friction by helping users move toward the item they want without the usual noise. This is especially relevant for users who care about focus and who may also want to avoid the general browsing environment of major marketplaces.

## Amazon compliance notes (this will be implemented later once accepted in to affliate progrma)
- Use the exact Amazon Associates website disclosure text somewhere clear on the site: `As an Amazon Associate I earn from qualifying purchases.`
- Keep the disclosure clear and conspicuous, not hidden in a footer-only placement or buried in legal text.
- Put a disclosure near affiliate CTAs / affiliate links as well, since Amazon expects disclosures to be adjacent to where users engage with the link.
- If social/account surfaces are added later, add the required affiliate disclosure in the associated profile/account context too.
- If live Amazon pricing, availability, discounts, or Prime-related data are shown later, verify and add any additional adjacent Amazon-required disclaimers for that content before launch.
- Before connecting any live Amazon affiliate or product integration, re-check Amazon's latest Operating Agreement and help docs because these requirements can change.
- Future UX and copy decisions should preserve trust and compliance: no misleading wording that could hide the affiliate relationship.

## flow of app
1. user arrives at a screen with inputs prompting them for a product topic and extra context, for example `lego` and `for a 9 year old boy who enjoys imagination`
2. the backend queries SerpApi for product results
3. first implementation milestone: return the first 4 usable results directly to the frontend so the raw search pipeline is proven
4. later milestone: send a larger result set to AI so it can filter for relevance and diversity, then return the final 4
5. eventual affiliate or retailer linking can be added once the search and filtering flow is stable

*there are more features to come this is v1*

## ui
- the overall feeling should be one of calm and focus. This directly as opposed to the feeling Amazon gives.
- UI decisions should be mobile-first. Small-screen layout and usability should be the default starting point, then expand upward for tablet/desktop.
- there will be a feature for searching history for v1 just put the ui there it wont really work
- i want it to not look so empty when i start. as i add features it will feel more rounded out. for now put in a couple dummy things maybe nav bar etc.
- there should be one input for product search context and another one for extra instructions/context, for example `lego` and `for a 9 year old boy with great imagination`
- there should be a skeleton for where the items will apear (during first ui setup mae it a 1 sec delay so i can see it working) if you deem it appropaite make either a loader or some way the user can feel like something is happening.
for now, give stock images and fake prices and stars and description

## stack
- first we will build this in React vite tailwind shadcn TanStack Query supabase. (I did not yet give instructions for db that will come later when i think more about ux for now we are trying to get a working slice) we will deploy with vercel and use vercel api routes
- when automated tests are added for this app, use Vitest as the test runner instead of Jest because it fits the Vite setup better
- once i have this working MVP i want to migrate to React native. This may be important when making decicions so it will be easier to migrate

## current implementation direction
- Keep the current frontend UI mostly as-is.
- Do not redesign the interface around SerpApi right now.
- The product should stay vendor-agnostic in both UX and backend structure so different search/data providers can support different tiers over time.
- The frontend and normalized backend response shape should belong to Focama rather than to any one provider, even if SerpApi remains useful in some plans.
- The site may eventually point users to Amazon or Walmart, so the frontend should stay flexible for those destinations.
- SerpApi is the practical interim data source until the product flow is working and Amazon Creator API approval is in place.
- SerpApi may still remain part of the product later for broader paid-tier search, so it should be treated as a provider option rather than as the identity of the app.
- The current priority is the simplest backend vertical slice:
  - query SerpApi
  - return 4 results
  - render those 4 results in the existing UI
- AI filtering comes after the raw SerpApi pipeline works.
- Avoid overengineering.

## workflow preference
- For small UI or copy changes, prefer using the dev server and manual verification instead of running `npm run build` every time.
- Reserve `npm run build` for significant changes, routing/layout changes, dependency changes, or meaningful checkpoints before handoff.
- Write tests as we go for parts of the app that would meaningfully reduce risk, protect important behavior, or save time during future changes.
- A part of the app significantly benefits from tests when at least one of these is true:
  - the logic is not trivial and is easy to break by accident
  - the behavior is important to the main user flow
  - the code handles edge cases, errors, formatting, filtering, or data transformation
  - the code connects the frontend to backend or external services
  - a bug there would be hard to notice through quick manual checking
  - the area is likely to be changed or expanded again soon
- Do not add tests for every small presentational change. Prefer tests where they give real protection, confidence, or faster iteration.
- Do not run automated tests by default. Only run Vitest when I explicitly ask to test the app.
- This repo should be treated as a PowerShell environment. Prefer PowerShell-safe commands and avoid Bash-style `&&` chaining.
- Use `project-notes/app_flow.md` for the current implemented user flow, temporary MVP behavior, and active integration assumptions. Keep `project-notes/doc_briefs.md` focused on product intent, UI direction, stack, and longer-term decisions.

## TO DO
- decide whether the product detail CTA on mobile should stay sticky at the bottom of the full-screen sheet or scroll naturally with the content
