# Codex Task: Card UX Improvements

## Goal
Three related UX changes to help users notice and engage with the AI writeup inside each product result, and to stop the Amazon CTA from dominating the card before users have gotten value.

---

## Change 1 — Loading message during finalize

**File:** `src/components/home/HomeExperience.jsx`
**Location:** `ResultsSectionFallback` component (around line 239), inside the `isFinalizing` block.

**What to change:**
Replace the current two-line loading copy:
- "Taking a closer look at the options."
- "We're narrowing the shortlist and locking the final picks."

With this single message (keep the existing pulsing dot indicator):

> Selecting your picks — open any result to see why it fits *your* needs and what to watch for.

The italic emphasis on *your* should be rendered as `<em>your</em>` in JSX (not bold).

**Behavior:** This block already disappears when results load. No additional fade logic needed — it's handled by the existing fallback/Suspense pattern.

---

## Change 2 — Bullet collapse in product modal

**File:** `src/components/home/ProductDetailModal.jsx`
**Location:** `featureBullets` rendering block (around line 163).

**Current behavior:** Shows up to 5 bullets (sliced at line 23), always fully expanded.

**New behavior:**
- If there are **4 or fewer** bullets: show all, no collapse widget.
- If there are **5 or more** bullets: show only the first 3, then render a `"Show all details"` button below that expands to show the rest inline. No re-collapse once opened.

**Implementation notes:**
- Add a `useState(false)` for `bulletsExpanded` local to the component.
- Remove the `.slice(0, 5)` on line 23 — pass the full `feature_bullets` array and slice in the render block based on the collapse logic.
- The "Show all details" button should match the existing low-key text style (small, muted — similar to the "Back to results" button style). Do not use a prominent button component.
- Expand inline — no scroll jump, no new screen.

---

## Change 3 — Move Amazon button and disclaimer under the image

**File:** `src/components/home/ProductDetailModal.jsx`

**Current layout:**
- Left column: product image only
- Right column (scrollable): title → price → rating → bullets → AI writeup → sticky bottom bar with [Amazon button + disclaimer + Back to results]

**New layout:**
- Left column: product image (larger — see below) → Amazon button → disclaimer text
- Right column (scrollable): title → price → rating → bullets → AI writeup — nothing else
- Full-width row below the grid: "Back to results" button (centered, spanning both columns)

### Image size
The image container currently has explicit heights (`h-60 sm:h-[300px]`). With the button now sharing the left column, remove the fixed heights and let the image take up the remaining space above the button naturally using `flex-col` layout on the left column. The image itself should be `flex-1` with `min-h-0`. This will make it visually larger on desktop since it fills more of the column.

### Left column restructure
Change the left column from a single image container div to a `flex flex-col` wrapper:
1. Image container — `flex-1 min-h-0` (takes available space)
2. Amazon button (same styling as current — orange, full width, rounded-2xl)
3. Disclaimer text (same styling as current — small, centered, muted)

### Right column
Remove the sticky bottom bar entirely from the right column. The right column should just be clean scrollable content: title, price, rating, bullets (with collapse from Change 2), and the AI writeup.

### Back to results
Move it out of the sticky bottom bar and place it as a standalone full-width centered row below the two-column grid, inside the modal content area. Keep its current button styling.

### Mobile behavior
On mobile the columns stack vertically (image on top, content below). The new stacking order will be:
1. Image
2. Amazon button + disclaimer (directly under image)
3. Title, price, rating, bullets, AI writeup
4. Back to results

This is intentional — the user and product owner have confirmed this layout.

---

## What not to change
- The close (X) button in the sticky top bar — leave as-is.
- The scroll hint chevron animation — leave as-is.
- The AI writeup shimmer/loading state ("Analyzing your pick…") — leave as-is.
- The "Back to results" button styling — only its position changes.
- The `onRetailerClick` handler on the Amazon link — keep it.
- The `resolveAmazonRetailerLabel` logic — keep it.
- Backend, routes, tests, or any files not listed above.

---

## Tests
- Run `npm run test` after completing changes and confirm no existing tests break.
- No new tests are required for these changes (UI layout and copy only).
