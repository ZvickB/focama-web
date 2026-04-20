# Onboarding Copy & UX Audit

**Priority:** Very high — new users are not understanding the flow or what to do.  
**Status:** Not started

---

## The Core Problem

The flow has three distinct steps (search → add context → get focused picks) but new users don't know that when they land. The page looks like a search engine. They type something, hit enter — and then it expands, asks a follow-up question, shows preview cards, and presents two buttons. Too much to parse without a mental model upfront.

---

## Step 1 — The Search Box

### Current copy
- Headline: "What are you looking for today?"
- Subline: "From too many choices to yours"
- Placeholder: `Try "travel stroller for airplane", "ergonomic office chair", or "lego botanical set"`
- Helper text: "Start with the product search you'd normally type into Google. Use the next step for budget, size, comfort, style, or other must-haves."

### Problems
- "From too many choices to yours" is poetic but says nothing about how the product works. New users won't know this isn't just a search engine.
- The helper text is the most important instruction on the page but it's small and easy to skim past.
- "Start with the product search you'd normally type into Google" buries the differentiator — the AI follow-up step.

### Suggested changes
- Replace subline with: *"Search, answer one question, get 6 focused picks"* — sets expectations in one line.
- Reframe helper text: *"Just the product for now — budget, size, and other details come next."*

---

## Step 2 — The Refinement Section

### Current copy
- Eyebrow pill: "A little more context"
- Label above textarea: "Add details to narrow the search"
- Placeholder: "Example: I want something lightweight for daily travel, under $200, and easy to clean."
- Loading micro-copy: "You can start typing while we put together an example suggestion, or just write your own."
- Primary button: "Show focused picks"
- Secondary button: "Show products now"
- Button sub-label: "Jump straight to results — no extra step needed."

### Problems
- "A little more context" and "Add details to narrow the search" say the same thing — redundant.
- The AI-generated question is visually prominent but "One suggestion, such as:" undersells it — users may not realise it's specific to their search.
- The two-button choice is the hardest moment for new users. They don't know what "focused" means vs "now". Looks like an equal choice when it isn't.

### Suggested changes
- Drop the label "Add details to narrow the search" — let the AI question carry the instruction.
- Change eyebrow from "A little more context" to "One quick question".
- Keep "Show focused picks" but add a sub-label: *"Best results — takes ~5 more seconds"*
- Rename "Show products now" to *"Skip — show what we have"* — signals it's a shortcut, not the main path.
- Change its sub-label from "Jump straight to results — no extra step needed." to something like *"Fewer results, no AI personalisation."*

---

## Step 3 — After Results Load

### Current copy
- Section heading: `Focused picks for "office chair"`
- Body: "These picks were finalized after your guided refinement. You now have six focused options."
- Modal header: "Product details" / "A closer look at this recommendation."
- Modal section: "Why this pick stands out" / "Possible drawbacks"

### Problems
- "You now have six focused options" is dry and doesn't reinforce the value — why are these better than Google results?
- "A closer look at this recommendation" in the modal is generic filler.

### Suggested changes
- Replace results body with: *"These 6 were chosen for your specific context — not just popularity."*
- Replace modal header subline with: *"Why we picked this for you."*
- Keep "Why this pick stands out" and "Possible drawbacks" — they're on-brand and honest.

---

## UI/UX Suggestions for Onboarding

### 1. Show the 3-step flow before they search
A simple `Search · Refine · Get picks` indicator above the search box (or as a subtitle) sets expectations immediately without requiring any reading. Users know what's coming.

### 2. Add a step indicator when refinement appears
The page expands after submitting — users on mobile may not see it scroll into view. A subtle "Step 2 of 3" label when the refinement section appears tells users where they are in the flow.

### 3. Demote "Show products now" to a text link
"Show focused picks" is the main action — it should be the only prominent button. "Show products now" should be a small text link underneath ("or skip this step"), not an equal-sized button competing for attention.

### 4. Clarify preview cards
Preview cards appearing while the AI question is still loading creates confusion — users see cards and think they're done, then don't understand why there's still a question above. Options:
- Hold preview cards until after the follow-up is submitted, OR
- Add a label to the preview state: *"Early results — add context above to sharpen these"*

### 5. Make cards feel more obviously tappable
"Tap for details" text at the bottom of the card is easy to miss. A small expand/chevron icon on the image or card corner would signal interactivity more clearly. Most users expect a product image to link out — a modal is unexpected without a visual hint.

---

## Files to Change

| File | What changes |
|------|-------------|
| `src/components/home/HomeExperience.jsx` | `HERO_SUBLINE`, helper text below search box, button labels and sub-labels, eyebrow pill text, step indicator |
| `src/components/home/HomeShared.jsx` | Results section heading/body, modal header copy |
| `src/components/ProductCard.jsx` | "Tap for details" / tappability affordance |
