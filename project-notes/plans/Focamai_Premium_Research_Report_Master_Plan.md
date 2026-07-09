# Focamai Premium Research Report --- Product Vision

## Vision

Add a premium, one-time purchase feature to Focamai called **Premium
Research Report**.

This is **not** a better search.

It is a personalized buying research report that helps users confidently
make important purchasing decisions. The goal is to make the user feel
as though an expert spent hours researching on their behalf.

------------------------------------------------------------------------

# Core Value Proposition

Current Focamai:

> "Tell me what you need and I'll give you great recommendations."

Premium Research:

> "I'll research this purchase in depth and explain exactly what I'd buy
> and why."

The emphasis is **confidence**, not information.

------------------------------------------------------------------------

# Experience Goal

The Premium Research Report should feel exclusive and luxurious
**without abandoning the existing Focamai brand**.

The user should feel like they have upgraded from browsing products to
working with a personal research consultant.

Every part of the experience---from the onboarding questions, to the
research process, to the report itself---should communicate that
meaningful work is being done specifically for them.

The goal is not simply to provide more information.

The goal is to create confidence while making the user feel like a VIP.

The user should finish thinking:

> "That was absolutely worth paying for."

------------------------------------------------------------------------

# Premium Experience Principles

Keep the existing Focamai branding.

Do **not** create an entirely different visual identity.

Instead, elevate the experience through:

-   Better typography hierarchy
-   More whitespace
-   Beautiful layouts
-   Smooth animations
-   Editorial-quality writing
-   Rich product imagery
-   Thoughtful pacing
-   Refined micro-interactions
-   Personalized language throughout

Think airline business class:

The airline's branding stays the same, but every interaction feels more
attentive, curated, and valuable.

------------------------------------------------------------------------

# When It Is Offered

The report should **not** appear for every product.

AI should determine whether the purchase is likely to benefit from
deeper research.

Good candidates:

-   Laptops
-   Cameras
-   Espresso machines
-   TVs
-   Mattresses
-   Strollers
-   Baby gear
-   Power tools

Poor candidates:

-   USB cables
-   Batteries
-   Paper towels
-   Dish soap

If the report is unlikely to provide value, explain that honestly
instead of trying to upsell.

Example:

> "This category has relatively few meaningful tradeoffs. A Premium
> Research Report is unlikely to add significant value."

Trust should always come before revenue.

------------------------------------------------------------------------

# Data Sources

Use a hybrid approach.

## Rainforest (or equivalent)

Use structured shopping data for:

-   Products
-   Pricing
-   Images
-   Specifications
-   Ratings
-   Affiliate links
-   Availability

This becomes the factual foundation.

## Higher-Level AI + Web Research

Research:

-   Expert review consensus
-   Community discussions
-   Long-term reliability
-   Ownership experience
-   Common complaints
-   Hidden tradeoffs
-   Buying advice

The AI enriches the structured shopping data rather than replacing it.

------------------------------------------------------------------------

# Pre-Research Consultation

Before research begins, ask only **one or two** high-value questions
that materially change the recommendation.

Examples:

-   What's your budget?
-   Is reliability or performance more important?
-   Is portability important?
-   Are there brands you'd prefer to avoid?

The goal is **not** to have a long conversation.

Once enough information is gathered, perform **one comprehensive
research pass**.

------------------------------------------------------------------------

# Setting Expectations

Before the user starts, clearly explain that this experience
intentionally takes longer than a normal search.

Suggested messaging:

> **This isn't an instant AI answer.**

> Premium Research performs a comprehensive buying analysis tailored
> specifically to your needs. It evaluates products, compares expert
> opinions, analyzes long-term ownership, weighs meaningful tradeoffs,
> and prepares a personalized buying report.

> **Most reports take approximately 30--60 seconds.** The additional
> time reflects the depth of the research---not unnecessary waiting.

The wait should always read as a **feature**, never as a limitation.

The user should think:

> "Great. It's actually doing real work for me."

------------------------------------------------------------------------

# The Research Ceremony

Never display a generic loading spinner.

Turn the waiting period into part of the premium experience.

The user should feel like they have handed the assignment to a
professional researcher.

Display meaningful progress as genuine work completes:

-   Understanding your priorities...
-   Finding the strongest candidates...
-   Comparing expert opinions...
-   Reviewing owner experiences...
-   Looking for long-term reliability concerns...
-   Identifying meaningful tradeoffs...
-   Separating marketing from substance...
-   Preparing your personalized report...

Whenever possible, every step should correspond to real work.

Occasionally surface interesting discoveries without revealing the final
recommendation.

Example:

> **Interesting finding**

> Multiple reviewers consistently praise Product A's performance but
> mention that replacement filters are unusually expensive.

or

> **Interesting finding**

> Experts largely agree on the top two products, but disagree
> significantly about which offers better long-term value.

These glimpses reinforce that real research is happening.

Finish with a satisfying transition:

> **Research complete.**

> Your personalized buying report is ready.

------------------------------------------------------------------------

# Mobile Experience

Design specifically for phones.

Do **not** compress a desktop report onto mobile.

Instead use:

-   Generous whitespace
-   Elegant typography
-   Horizontal product galleries
-   Collapsible sections
-   Progressive disclosure
-   Smooth transitions

The report should feel premium rather than overwhelming.

------------------------------------------------------------------------

# Opening Screen

The report should immediately answer three questions.

## 1. What was researched?

Example:

> I analyzed available products, compared expert opinions, evaluated
> long-term reliability, reviewed owner experiences, and considered your
> priorities before selecting the strongest recommendations.

## 2. What matters for this purchase?

Write a short editorial paragraph explaining the important tradeoffs for
this category.

Teach the user something valuable instead of filling space.

## 3. Top Choices

Display a horizontal gallery of finalists.

Each card includes:

-   Product image
-   Name
-   Price
-   One-line reason

Examples:

-   Best Overall
-   Best Value
-   Best Premium Choice
-   Best for Beginners

------------------------------------------------------------------------

# Report Structure

Possible sections:

-   Executive Summary
-   My Recommendation
-   Top Picks
-   Comparison Table
-   Why These Products Made the List
-   Important Tradeoffs
-   Expert Consensus
-   Community Consensus
-   Long-Term Ownership
-   Reliability
-   Maintenance
-   Alternatives
-   Buying Advice
-   Frequently Asked Questions

------------------------------------------------------------------------

# Tone

The AI should be decisive.

Instead of:

> "It depends..."

Prefer:

> "If I were buying today for your priorities, I would choose Product
> X."

Include confidence where appropriate.

------------------------------------------------------------------------

# Monetization

Potential revenue:

1.  Premium report purchase (\~\$0.99)
2.  Affiliate commission if the user purchases through Focamai

The report should increase purchase confidence, improving both user
satisfaction and affiliate conversion.

------------------------------------------------------------------------

# Trust Principles

Recommendations must always be based on what is best for the user.

Never bias recommendations toward higher affiliate commissions.

Long-term trust is the competitive advantage.

------------------------------------------------------------------------

# Long-Term Vision

This remains a premium feature inside Focamai.

Its purpose is to:

-   Reduce browsing.
-   Reduce research.
-   Increase confidence.
-   Help users make better purchasing decisions.

The Premium Research Report should feel like hiring a knowledgeable
buying consultant---not simply paying for a longer AI response.

------------------------------------------------------------------------

# Pre-Plan Discussion Addendum (2026-07-08)

Decisions and notes from the initial think-through session. This doc is
a **nascent pre-plan / vision**, not an active implementation plan.

## Monetization decisions

-   Working price: **\$2.99** (replaces the \$0.99 figure above).
    At \$2.99 the net after card fees (~\$2.60) comfortably covers the
    research-pass API cost; \$0.99 was margin-thin and anchored the
    feature as cheap. Anything higher (\$4.99+) fails the buyer's
    "I can't judge quality until after I've paid" test.
-   **Public sample report**: one polished full example (e.g. espresso
    machines) anyone can read. This is the main way buyers judge
    quality before paying.
-   **First report free** for signed-in users. Combined with the
    sample, this removes most pre-purchase doubt.
-   **No refunds.** First-free + sample already de-risk the purchase;
    a refund policy would mostly be claimed by people who'd have paid
    anyway. (If paywall conversion ever stalls post-launch, a refund
    policy remains an untested lever.)
-   **Partial preview (free summary, paywalled full report): deferred.**
    Needs testing, and the right cut-line can't be designed until real
    reports exist and we see which section makes people want the rest.

## Rollout decisions

-   **Phase order: free-for-testers first.** Validate report quality,
    real cost per report, and actual research timing before building
    any payment infrastructure. The 30--60s expectation copy above
    should be driven by measured timing, not assumed.
-   **Tester gating is cheap and already patterned**: reuse the Deep
    Dive email-allowlist approach (`DEEP_DIVE_SUBSCRIBER_EMAILS` in
    `backend/lib/auth.js`) — e.g. a `PREMIUM_REPORT_TESTER_EMAILS` env
    var on Render, checked server-side after JWT verification before
    any expensive work runs. Adding a tester = editing one env var.
-   **Payments are net-new infrastructure** (no Stripe or any payment
    stack exists today) and are likely the largest engineering lift of
    the whole feature — deferred until the free phase proves the
    report is worth paying for.

## Gating decisions (when the report is offered)

Decided 2026-07-08. The gate is **criteria-based classification, not
open-ended AI judgment** — the AI matches the query against written
categories/criteria rather than deciding "is this worth premium
research?" on its own. This keeps offers consistent (same query always
gets the same answer), auditable, and tunable by editing the list
instead of rewriting prompts. It follows the same lesson as the
Compare-prices eligibility gate, which started as an AI judgment pass
and ended up deterministic.

Evaluation order:

1.  **Medical/health exclusion — deterministic, fail-closed, overrides
    everything.** Hearing aids, CPAP, mobility aids, supplements,
    monitors, therapeutic devices, anything health-adjacent. Reason:
    AI research the user cannot have a human verify must not carry
    purchase-decision weight on health. If it is *unclear* whether a
    query is health-adjacent, do not offer. No explanation copy needed
    — the offer simply never appears.
2.  **Core category allow list** (laptops, mattresses, strollers,
    espresso machines, TVs, cameras, power tools, ...) — offer
    confidently. This list is also a product asset: it drives sample
    reports and category-specific report prompts later.
3.  **High-stakes long-tail bucket** — non-medical categories matching
    written criteria (meaningful tradeoffs, typically $150+,
    infrequent purchase, long-term ownership, real expert/community
    research exists) — offer.
4.  **Uncertain value** (wellness-adjacent-but-fine or
    tradeoff-thin-but-maybe: air purifiers, massage guns, ergonomic
    chairs) — **offer with an honest caveat**: "this category may not
    have enough meaningful tradeoffs to justify a full report." Let
    the user decide; log these to learn the real boundary.
5.  **Clear commodity** — honest decline, as in the doc body above.

Governing rule: **doubt about value errs toward offering with honesty;
doubt about whether the AI should be saying something it shouldn't errs
toward not offering.** Value mistakes cost $2.99 of trust; safety
mistakes are not refundable.

Category match should be paired with purchase signals (price,
identity), not category alone — "laptop" qualifies, a $60 toy laptop
does not. The Compare-prices deterministic prefilter is the existing
pattern to reuse. Grow the core list from logged bucket-4/bucket-3
matches on real tester queries rather than guessing upfront.

## Open items / tensions to resolve before this becomes a real plan

-   **Cheapest validation first**: hand-generate 2--3 reports (real
    queries, capable model, no product code) and judge whether the
    output feels "worth paying for" or just like a longer AI answer.
    The whole vision rests on that gap being real.
-   **Primary purpose needs one answer** — direct revenue, affiliate
    conversion booster, or brand differentiator. The choice settles
    pricing, gating, and ceremony investment downstream. Current lean:
    booster/differentiator over direct revenue at this stage.
-   **Tone tension**: the report's decisive "I would buy X" voice is a
    different user relationship than the free product's
    "honest tradeoffs, decide for yourself" voice. Decisiveness is
    right for a paid consultant context, but the honest-caveat
    requirement from the product voice must carry over explicitly into
    report prompts.
-   **Ceremony honesty**: tighten "whenever possible" — progress steps
    shown during research must map to real pipeline stages, full stop.

--- *Discussed with and written up by Claude (Fable 5), 2026-07-08.*
