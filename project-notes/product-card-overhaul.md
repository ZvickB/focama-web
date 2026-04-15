# Product Card Overhaul — Planned Work

Full redesign of `src/components/ProductCard.jsx`. Do all of these together in one pass.

---

## Image Area
- `aspect-square` + `object-contain` + `p-4` makes images feel small and padded
- Switch to a taller image area (`aspect-[4/3]` or fixed height) with reduced or no padding
- `object-contain` is probably still safer than `object-cover` given varied product image shapes
- `bg-stone-50` fill around transparent images is fine — revisit once padding is resolved

## Information Hierarchy
- Price currently renders before the title — swap them: name first, price second
- Subtitle badge is `hidden sm:inline-flex` — invisible on mobile; decide whether to show it always or drop it
- Description and fit reason are both `hidden sm:block` — most valuable lines on the card, shouldn't be hidden on mobile

## Bottom Bar
- "Click for details" / "Tap for details" is redundant — the card is already a button, users don't need to be told
- Two competing affordances: whole card opens modal, bottom bar has direct retailer link — the distinction isn't obvious to the user
- Two `CardContent` sections with a border between them creates a receipt-like structure — simplify to one content area

## Hover State
- `-translate-y-1` lift on hover looks detached because the shadow doesn't deepen to match
- Either deepen the shadow on hover or remove the lift — they need to work together

## Fit Reason Surfacing
- `fit_reason` only appears in the detail modal — consider surfacing one line on the card itself once enrichment is ready
- `line-clamp-2` on both description and reason often clips mid-sentence; one clean line is better than two truncated ones

## General
- Cleaner single-section card body, less visual layering
- Make the modal-open vs retailer-link affordances visually distinct and intentional
