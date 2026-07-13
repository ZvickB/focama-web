# Account Ranking Preferences — Live Evaluation (2026-07-12)

## Purpose

Evaluate whether `balanced`, `price`, `brand`, and `range` actually change the
**six selected picks**, rather than only their displayed order.

## Method

- Ten real Amazon US Rainforest discoveries, each using the submitted query and
  contextual notes below.
- Each resulting candidate pool was sent to Haiku four times: once per strategy.
- The four strategy calls for a given case used the exact same Rainforest pool.
- Haiku used the production selection call with `temperature: 0` and selected up
  to six candidates through the strict index tool.
- Pools are capped at 30; several real searches returned fewer usable candidates
  after filtering (16–30).
- Product names below are shortened only for readability. Prices are the live
  listed Amazon prices at evaluation time, not shipping/tax/coupon-adjusted totals.

## Summary

| # | Search context | Pool | Price overlap with balanced | Brand overlap | Range overlap |
|---|---|---:|---:|---:|---:|
| 1 | Wireless headphones for commuting/work calls | 25 | 5/6 | 6/6 | 6/6 |
| 2 | Office chair for long workdays/lower-back support | 30 | 3/6 | 5/6 | 5/6 |
| 3 | Beginner cordless drill for home projects | 30 | 5/6 | 4/6 | 5/6 |
| 4 | Lightweight airport/city travel stroller | 16 | 5/6 | 6/6 | 6/6 |
| 5 | Beginner espresso coffee grinder | 30 | 5/6 | 5/6 | 5/6 |
| 6 | Quiet allergy bedroom air purifier | 16 | 4/6 | 6/6 | 5/6 |
| 7 | Compact laptop-and-phone travel USB-C charger | 26 | 5/6 | 6/6 | 5/6 |
| 8 | Low-maintenance robot vacuum for pet hair | 16 | 6/6 | 6/6 | 6/6 |
| 9 | Easy-install, dependable night-driving dash cam | 22 | 6/6 | 6/6 | 6/6 |
| 10 | Durable beginner everyday kitchen knife set | 30 | 5/6 | 6/6 | 6/6 |

Across 60 selected slots:

- **Price** replaced 11 balanced picks (49/60 overlap; 18% changed).
- **Brand** replaced 4 balanced picks (56/60 overlap; 7% changed).
- **Range** replaced 5 balanced picks (55/60 overlap; 8% changed).

The strategy can change shortlist composition, but not reliably enough yet for the
strong product promise that each mode should intentionally shape the six picks.

## Detailed comparisons

### 1. Wireless headphones — commuting and work calls, comfortable microphone, under $180

Pool: 25 usable candidates.

- Balanced: TECKNET work headset ($44.99); AOC work headset ($39.98); JIAMQISHI work headset ($46.99); Mopchnic headset ($69.99); awatrue headset ($49.99); JLab Go Work Gen 3 ($44.99).
- Price: TECKNET ($44.99); AOC ($39.98); generic work headset ($33.23); JIAMQISHI ($46.99); awatrue ($49.99); JLab ($44.99).
- Brand: the same six as balanced, only with a minor order change.
- Range: the same six as balanced, in the same order.

Observation: price found one cheaper replacement. Brand and range did not change
the recommended set; the pool itself was dominated by generic work headsets.

### 2. Office chair — long workdays, lower-back support, breathable seat

Pool: 30 usable candidates.

- Balanced: Duramont ergonomic chair ($289.98); padded-lumbar chair ($169.99); CleverSeat mesh chair ($299.99); ergonomic back/neck chair ($169.99); ergonomic mesh chair ($247.49); adjustable-lumbar mesh chair ($215.99).
- Price: Duramont ($289.98); padded-lumbar chair ($169.99); foam-cushion office chair ($149.99); CleverSeat ($299.99); four-way-lumbar chair ($139.99); FelixKing mesh chair ($129.99).
- Brand: padded-lumbar chair; Duramont; CleverSeat; four-way-lumbar chair; ergonomic back/neck chair; adjustable-lumbar mesh chair.
- Range: Duramont; padded-lumbar chair; CleverSeat; four-way-lumbar chair; ergonomic mesh chair; ergonomic back/neck chair.

Observation: price made a real composition change, including $129–$150 options.
However, it still kept two $290–$300 chairs, so it is not consistently behaving as
"one best fit plus otherwise lower-cost alternatives." Brand and range were mild.

### 3. Cordless drill — beginner apartment/home projects

Pool: 30 usable candidates.

- Balanced: AVID POWER 20V ($39.99); BLACK+DECKER 8V ($35.99); COMOWARE 20V ($31.99); AVID POWER 12V ($24.98); FADAKWALT 12V ($21.98); generic 12V drill ($20.99).
- Price: AVID POWER 20V ($39.99); BLACK+DECKER 8V ($35.99); AVID POWER 12V ($24.98); COMOWARE 20V ($31.99); FADAKWALT ($21.98); DEKOPRO 20V ($29.99).
- Brand: AVID POWER 20V; BLACK+DECKER 8V; DEWALT 20V ($99); COMOWARE; AVID POWER 12V; WORKPRO 12V ($36.99).
- Range: AVID POWER 20V; BLACK+DECKER 8V; DEWALT 20V ($99); COMOWARE; AVID POWER 12V; FADAKWALT.

Observation: this is the clearest brand/range success. Brand introduced DEWALT and
WORKPRO; range introduced the $99 DEWALT option alongside lower-cost choices.

### 4. Travel stroller — lightweight compact airport/city travel

Pool: 16 usable candidates.

- Balanced: gb Pockit Air ($189.99); MAMAZING Ultra Air ($188.99); Mompush Jeto ($89.99); Ingenuity 3D Mini ($69.88); Dream On Me Coast Rider ($79.75); Graco Ready2Jet ($151.99).
- Price: Dream On Me Coast Rider ($79.75); Ingenuity 3D Mini ($69.88); MAMAZING ($188.99); Mompush ($89.99); gb Pockit ($189.99); Dream On Me Aero umbrella stroller ($32.49).
- Brand: the same six as balanced, reordered.
- Range: the same six as balanced, in the same order.

Observation: price added a clearly cheaper stroller but moved away from the stated
"best overall first" behavior by placing the $79.75 item first. Brand/range did not
change selection in a small pool.

### 5. Coffee grinder — beginner espresso, consistent grind

Pool: 30 usable candidates.

- Balanced: IAGREEA conical burr ($79.99); generic conical burr ($72.99); AMZCHEF conical burr ($89.99); SHARDOR conical burr ($69.99); Cuisinart blade grinder ($53.99); Ollygrin burr ($57.79).
- Price: IAGREEA ($79.99); generic conical burr ($72.99); SHARDOR conical burr ($69.99); Cuisinart blade grinder ($53.99); SHARDOR burr 2.0 ($39.98); Ollygrin ($57.79).
- Brand: OXO Brew conical burr ($109.95); IAGREEA; generic conical burr; SHARDOR; AMZCHEF; Cuisinart.
- Range: IAGREEA; generic conical burr; AMZCHEF; SHARDOR conical burr; Cuisinart blade; SHARDOR burr 2.0 ($39.98).

Observation: brand correctly introduced OXO, but price selected a blade grinder for
an espresso-consistency request. This exposes a fit-quality problem: mode-specific
selection can still weaken an important inferred product requirement.

### 6. Air purifier — quiet bedroom allergy use

Pool: 16 usable candidates.

- Balanced: LEVOIT Core-style purifier ($84.99); LEVOIT bedroom purifier ($39.99); AROEVE ($39.99); Purivortex ($29.99); LEVOIT larger-room purifier ($199.99); PuroAir 130i ($129.99).
- Price: LEVOIT ($84.99); LEVOIT bedroom ($39.99); AROEVE ($39.99); Purivortex ($29.99); Afloia ($59.97); FULMINARE H13 ($24.99).
- Brand: the same six as balanced.
- Range: LEVOIT ($84.99); LEVOIT larger-room ($199.99); LEVOIT bedroom ($39.99); AROEVE ($39.99); Purivortex ($29.99); Canopy bedside purifier ($99.99).

Observation: price does create a lower-cost set; range creates a more meaningful
price/format spread. Brand still does not materially enforce established brands.

### 7. USB-C charger — compact, reliable laptop-and-phone travel charging

Pool: 26 usable candidates.

- Balanced: Anker 65W 3-port ($29.99); Anker 100W ($29.99); Anker Nano 65W ($29.99); INIU 65W ($19.77); UGREEN 65W ($21.49); Anker 30W ($15.99).
- Price: same as balanced except a generic 65W 3-port charger ($16.99) replaces Anker 30W.
- Brand: the same six as balanced.
- Range: same as price.

Observation: the balanced pool already contains strong established brands, so no
brand change is necessary. Range does not add a distinct charging capability,
though; it mostly copies the price replacement.

### 8. Robot vacuum — pet hair, small apartment, simple maintenance

Pool: 16 usable candidates.

- Balanced: Lefant ($89.99); Tikom mop combo ($108.99); eufy 11S Max ($149.99); iRobot Roomba 105 ($159); ROPVACNIC mop combo ($89.99); ILIFE V2 ($79.99).
- Price: the exact same six as balanced, reordered.
- Brand: the exact same six as balanced.
- Range: the exact same six as balanced, reordered.

Observation: no strategy changed the shortlist, despite a category where known
brands and a meaningful capability/price range should plausibly produce a different
mix. This is a clear miss for the current strategy prompts.

### 9. Dash cam — dependable night video, easy installation

Pool: 22 usable candidates.

- Balanced: REDTIGER 4K ($129.99); ROVE R2-4K Dual ($107.99); 70mai 4K ($79.99); 360 four-channel ($99.99); galphi 4K ($49.99); BOOGIIO 1080p ($59.99).
- Price, brand, and range: the exact same six as balanced, with only minor order changes.

Observation: all modes failed to alter the chosen products. This is especially
important because night-driving reliability is a context where generic low-price
items should not simply persist unchanged under every strategy.

### 10. Kitchen knife set — durable beginner everyday use

Pool: 30 usable candidates.

- Balanced: Astercook 13-piece ($19.95); Astercook color-coded 12-piece ($16.98); CAROTE 12-piece ($19.99); Astercook 6-piece ($19.98); EWFEN 14-piece ($29.99); Amazon Basics color-coded ($17.59).
- Price: Astercook 13-piece; Astercook 12-piece; CAROTE; ROMANTICIST 10-piece ($19.99); EWFEN; Amazon Basics.
- Brand: the same six as balanced, reordered.
- Range: the same six as balanced, reordered.

Observation: price made only a near-equivalent replacement. Brand did not turn a
generic-heavy set into a recognizable-brand-oriented set; range did not create a
meaningful span of knife-set styles or price points.

## Assessment

### What is working

- The plumbing works: every mode reached Haiku and returned six valid candidates
  from the server-owned Rainforest pool.
- Price mode does sometimes alter composition in the expected direction, notably
  office chairs and air purifiers.
- Brand and range can work when the pool makes an obvious difference available,
  as with DEWALT in the cordless-drill pool and OXO in the coffee-grinder pool.
- Some unchanged sets are correct: USB-C chargers already contained Anker/UGREEN,
  so brand had little to improve.

### What is not ready

I would **not ship the preference feature as a dependable account-level promise
yet**.

- **Brand is too weak.** It changed only 4 of 60 selected slots and left clearly
  generic-heavy robot-vacuum and knife-set lists untouched.
- **Range is too weak.** It changed only 5 of 60 slots and frequently only reordered
  the same six; that does not satisfy the intended "different options" behavior.
- **Price is directionally useful but inconsistent.** It changed 11 slots, but it
  sometimes keeps expensive choices beyond the hero pick and, for the stroller,
  promoted a lower-priced option over the stronger travel fit. It also admitted a
  blade grinder for an espresso-consistency context.
- The evaluation exposes a broader limitation: these are prompt-only preferences.
  Haiku sees titles, ratings, prices, and signals, but there is no deterministic
  representation of established brands, meaningful product-type differences, or
  shortlist coverage. The model therefore has no dependable way to enforce the
  promised set-level behavior.

## Recommended next implementation step

Keep the existing account preference and waiting reminder, but do not declare the
selection strategies complete. Add small deterministic signals before further prompt
tuning:

1. A category-aware/maintained recognized-brand signal for the brand strategy.
2. A candidate family/type and price-band signal for range coverage.
3. A deterministic post-selection check for price mode: preserve the strongest-fit
   hero and require a meaningful lower-price alternative only when it remains
   eligible and credible.
4. Re-run this same ten-case evaluation after those signals exist. The desired
   result is not forced difference in every case; it is a clearly explainable
   difference whenever the pool offers one.

This document is an evaluation artifact, not a record of a production behavior
change.
