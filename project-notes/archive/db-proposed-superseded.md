# Proposed DBs

## Purpose
- This note lists the proposed Supabase tables for the current Focamai phase.
- It separates infrastructure tables from behavior-learning tables.
- It also shows which tables help answer both product-usage questions and the prewarm experiment question.

## The main question this note answers
- What data do we need to keep the app running well?
- What data do we need to understand how people actually use the app?
- What data do we need to tell whether the prewarm strategy helped?

## Recommended v1 table groups

### 1. Core app infrastructure tables

#### `search_cache`
What it is for:
- Stores guided discovery candidate pools.
- Lets finalize and retry rebuild from the cached discovery state.
- Reduces repeated search/discovery cost.

Why it matters:
- Keeps the guided flow fast and cheaper.
- Supports the current backend architecture directly.

Used for user behavior learning:
- Not primarily.

Used for prewarm testing:
- Indirectly only.
- Prewarm still depends on the same guided discovery context being available.

#### `search_history`
What it is for:
- Internal operational telemetry.
- Records cache hits/misses, candidate counts, result counts, and selection mode.

Why it matters:
- Helps debug backend behavior.
- Helps inspect whether search/cache behavior is healthy.

Used for user behavior learning:
- Only lightly.
- This is operational logging, not the main product-behavior table.

Used for prewarm testing:
- Indirectly only.
- Useful for backend debugging, but not the main source of truth for prewarm success.

#### `rate_limit_events`
What it is for:
- Shared rate limiting across instances.
- Infrastructure for abuse protection.

Why it matters:
- Needed for production-safe request limiting.

Used for user behavior learning:
- No.

Used for prewarm testing:
- No, except that prewarm adds request volume and rate-limit behavior still has to stay healthy.

## 2. Product behavior and learning tables

These are the tables that should be treated as the main source of truth for how people use Focamai.

#### `analytics_search_runs`
What it is for:
- One row per search run.
- Stores the initial product query.
- Records whether the user entered AI refinement.
- Records whether they used `Show products now`.
- Records whether they completed finalize.

Why it matters:
- Tells you what people search first.
- Gives each search flow a stable `search_id`.
- Lets later events and clicks attach to one search session.

Used for user behavior learning:
- Yes.
- This is one of the main tables for understanding whether people are using the AI step.

Used for prewarm testing:
- Yes.
- Helps compare searches that used empty-note finalize, refined finalize, and prewarm-assisted finalize.

#### `analytics_search_events`
What it is for:
- Event stream for guided flow behavior.
- Stores milestones like:
  - `search_started`
  - `discovery_loaded`
  - `refine_viewed`
  - `show_products_now_clicked`
  - `ai_followup_submitted`
  - `final_results_shown`
  - prewarm lifecycle events such as started, ready, consumed, unused, aborted, and failed

Why it matters:
- This is the clearest way to see whether users move from first search to refine to final results.
- Lets you see dropoff and path choice.

Used for user behavior learning:
- Yes.
- This is the most important table for understanding whether users actually engage with the AI part.

Used for prewarm testing:
- Yes.
- This is the most important table for measuring whether prewarm was used, wasted, or helpful.

#### `analytics_result_impressions`
What it is for:
- Records which products were shown.
- Distinguishes result sets such as `preview`, `final`, `retry`, and `previous`.
- Stores rank position, provider, and badge data.

Why it matters:
- Shows what users actually saw before clicking or retrying.
- Lets you compare preview vs finalized result exposure.

Used for user behavior learning:
- Yes.
- Helps answer whether the AI-finalized set is materially different from the preview set.

Used for prewarm testing:
- Yes, secondarily.
- Helpful when comparing what users were shown in prewarm-assisted paths versus other paths.

#### `analytics_result_clicks`
What it is for:
- Records which products users clicked.
- Distinguishes preview clicks, final-result clicks, card opens, and retailer clicks.

Why it matters:
- This is one of the strongest behavioral signals for whether results helped the user.
- Helps answer whether the AI path leads to stronger engagement than preview-only behavior.

Used for user behavior learning:
- Yes.
- One of the best current proxies for "did this help?"

Used for prewarm testing:
- Yes, secondarily.
- Lets you compare whether prewarm-assisted focused picks still lead to useful clicks.

## Tables that serve both user behavior learning and prewarm testing

These are the overlap tables.

### Highest overlap
- `analytics_search_runs`
- `analytics_search_events`

Why:
- They tell you the first query.
- They tell you whether the user followed up with AI.
- They tell you whether the user used the quick path.
- They tell you whether prewarm was started, consumed, wasted, or abandoned.

### Important supporting overlap
- `analytics_result_impressions`
- `analytics_result_clicks`

Why:
- They help answer whether the flow actually produced useful product engagement.
- They help compare preview behavior, finalized behavior, retry behavior, and prewarm-assisted behavior.

## Recommended minimum v1 DB set

### Keep as core infrastructure
- `search_cache`
- `search_history`
- `rate_limit_events`

### Add and actively use for product learning
- `analytics_search_runs`
- `analytics_search_events`
- `analytics_result_impressions`
- `analytics_result_clicks`

## Not recommended yet

Do not add these yet unless product direction changes explicitly:
- `search_sessions`
- `search_shortlists`
- `shortlist_items`
- user accounts tables
- saved searches tables
- saved items tables
- user preferences tables

Why not yet:
- The app still needs usage learning more than persistent user-memory features.
- Adding those now would widen product scope before the current guided flow is understood well enough.

## Simple decision summary

If the goal is:

### "Keep the app working"
Use:
- `search_cache`
- `search_history`
- `rate_limit_events`

### "Understand what people search first and whether they use AI refinement"
Use:
- `analytics_search_runs`
- `analytics_search_events`

### "Understand whether the results helped"
Use:
- `analytics_result_impressions`
- `analytics_result_clicks`

### "Test whether prewarm helped"
Use:
- `analytics_search_runs`
- `analytics_search_events`
- `analytics_result_impressions`
- `analytics_result_clicks`

## Practical recommendation
- Treat the analytics tables as part of the real v1 product instrumentation now, not as optional extras.
- Keep `search_history` as operational telemetry only.
- Use the analytics tables to answer product questions and experiment questions from one consistent data model.

## Related notes
- `project-notes/db-needs.md`
- `project-notes/current-status.md`
- `project-notes/app_flow.md`
- `project-notes/analytics-funnel-schema.sql`
