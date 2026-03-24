# Archived UI Screen Choices

These homepage variants were removed from the live app so they no longer add route/bundle weight.

Archived files:
- `pages/HomePageHero.jsx`
- `pages/HomePageFlow.jsx`
- `pages/HomePageConcierge.jsx`
- `pages/HomePageInstant.jsx`
- `pages/HomePageOpen.jsx`
- `components/home/HomeExperience.multivariant.jsx`

How to preview one again:
1. Copy the variant page you want back into `src/pages/`.
2. If needed, copy `components/home/HomeExperience.multivariant.jsx` back over `src/components/home/HomeExperience.jsx`.
3. Re-add the route in `src/App.jsx`.

The live app now uses the `open` experience only.
