# Price Drop Watch — Implementation Plan

**Written:** 2026-06-25
**Status:** Phase 3 implemented behind `PRICE_WATCH_EMAILS_ENABLED=true`. Scheduled execution uses the existing Render web service through a protected internal endpoint; a production GitHub Actions manual run passed on 2026-06-28. A separate Render Cron service is not required.
**Sequence:** table + gate → frontend watch CRUD → check job (dry-run) → email (live). Each phase ships on its own.

---

## Locked product decisions

- **What is watched:** a **specific product** (ASIN + amazon_domain), not a whole saved search. Cheapest to run — cost scales with distinct watched ASINs, not total watches.
- **Trigger:** price drops **≥ 5% below the active baseline** and/or reaches the user's optional absolute target price. **5% is the default; the user can change the percentage per watch.**
- **Notification channel:** **email**, via Resend.
- **Gate (now):** any **logged-in** user can create watches. Search itself stays ungated.
- **Limit (now):** each user can have **at most 5 active watches**. Paused watches still count for v1 unless this becomes annoying in testing.
- **Gate (later):** tighten to subscribers via the existing `isSubscriber` check in `backend/lib/auth.js`. Testers stay enabled through the existing `DEEP_DIVE_SUBSCRIBER_EMAILS` env allowlist pattern. This is Phase 4 — deferred, no UI rework.
- **Re-notify rule:** after an alert fires, reset the baseline to the notified price. Future alerts need a new drop from that reset baseline and still must beat the absolute target rule when configured. No daily spam on a product that simply settled lower.
- **Entry point:** v1 adds the watch action in the **finalized product modal only**, not preview cards and not result cards.

### Not building yet
- Web push (PWA push is reachable later via `vite-plugin-pwa`, but email first).
- Watching a whole saved search or preview products before Focamai has finalized the shortlist.
- Price history charts.
- Per-tier watch limits (added with the Phase 4 subscriber gate).

---

## Architecture in one line

`price_watches` table → protected web-service endpoint re-prices watched ASINs daily when called by an external scheduler → email when a price crosses the user's threshold, with a debounce so it only fires on genuine new drops.

What's reused (already in the repo):
- **Watch table shape** mirrors `saved_searches` — `user_id` ownership, Supabase RLS.
- **Re-pricing** uses a Rainforest-backed ASIN price-check contract. The existing `fetchAmazonProductDetailsByAsin` path is close, but before alerts ship it must explicitly return/store a fresh positive numeric price. Do not rely on formatted price strings or the current bullets/description-only cache shape for alert decisions.
- **Identity** reuses the existing auth shell (`AuthProvider`, `useAuth`, `AuthModal`) and the admin Supabase client (`getSupabaseAdminClient` in `backend/lib/storage/supabase-client.js`) for the server-side job.

What's genuinely new to the stack (and the real work of this feature):
1. A **scheduler trigger** — the job runs inside the existing Render web service at `POST /api/internal/check-price-watches`; call it daily from GitHub Actions or another HTTP scheduler with `Authorization: Bearer $PRICE_WATCH_INTERNAL_TOKEN`.
2. An **email sender** — no email dependency exists today. Add Resend.
3. A **price freshness contract** — current product-detail cache is useful for modal enrichment, but price alerts need `currentPrice`, `currency/domain`, `checkedAt`, and source/freshness rules.

---

## Storage interface (same trick as the history plan)

The UI talks to one abstraction, never to Supabase directly:

```js
// src/lib/watch/watchStore.js  (interface)
//   list()              -> Promise<Watch[]>   (newest first)
//   create(watch)       -> Promise<Watch>     (insert; ignore/return existing on duplicate)
//   update(id, patch)   -> Promise<Watch>     (e.g. change threshold_pct, target_price, pause)
//   remove(id)          -> Promise<void>
```

Logged-in only, so there is no localStorage phase here — `create` requires a session. Logged-out clicks open `AuthModal` first.

### Shared data shape

```js
{
  id:               string,   // uuid
  asin:             string,
  amazonDomain:     string,   // price is per-marketplace
  productTitle:     string,   // snapshot — list + email render without re-fetch
  imageUrl:         string,   // snapshot
  productUrl:       string,   // snapshot — carries the affiliate tag in the email button
  baselinePrice:    number,   // active baseline; starts as add-time price, resets after each alert
  thresholdPct:     number,   // default 5; user-editable per watch
  targetPrice:      number|null, // optional absolute "tell me under $X"; null = use thresholdPct only
  lastSeenPrice:    number|null, // updated every check
  lastCheckedAt:    string|null,
  lastNotifiedPrice:number|null, // debounce anchor
  lastNotifiedAt:   string|null,
  paused:           boolean,
  activeCounted:    boolean,  // conceptual only: active/paused both count toward the v1 max of 5
  createdAt:        string,
  updatedAt:        string,
}
```

---

## Phase 0 — Table, RLS, gate (no UI)

### Table — `price_watches`

```sql
create table if not exists public.price_watches (
  id                  uuid primary key default gen_random_uuid(),
  user_id             uuid not null references auth.users(id) on delete cascade,
  asin                text not null,
  amazon_domain       text not null default 'amazon.com',
  product_title       text not null default '',
  image_url           text not null default '',
  product_url         text not null default '',
  baseline_price      numeric not null,
  threshold_pct       numeric not null default 5,      -- user-editable; 5% default
  target_price        numeric,                          -- optional absolute target; null = pct only
  last_seen_price     numeric,
  last_checked_at     timestamptz,
  last_notified_price numeric,
  last_notified_at    timestamptz,
  paused              boolean not null default false,
  created_at          timestamptz not null default timezone('utc', now()),
  updated_at          timestamptz not null default timezone('utc', now())
);

alter table public.price_watches
  add constraint price_watches_baseline_positive check (baseline_price > 0),
  add constraint price_watches_threshold_range check (threshold_pct > 0 and threshold_pct <= 100),
  add constraint price_watches_target_positive check (target_price is null or target_price > 0);

-- one watch per user per product per marketplace
create unique index if not exists price_watches_user_asin_domain_idx
  on public.price_watches (user_id, asin, amazon_domain);

-- the job reads active watches; helps the dedupe scan
create index if not exists price_watches_active_idx
  on public.price_watches (paused, asin, amazon_domain);

alter table public.price_watches enable row level security;

create policy "read own watches"   on public.price_watches
  for select using (auth.uid() = user_id);
create policy "insert own watches" on public.price_watches
  for insert with check (auth.uid() = user_id);
create policy "update own watches" on public.price_watches
  for update using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "delete own watches" on public.price_watches
  for delete using (auth.uid() = user_id);
```

> RLS lets each user touch only their own rows from the browser. The server-side job uses the **service key** (`getSupabaseAdminClient`), which bypasses RLS so it can see every user's watches — that is exactly why the job runs server-side and the CRUD runs browser-side.

### Gate helper

```js
// backend/lib/price-watch-gate.js  (and a thin frontend mirror for button state)
// canUsePriceWatch(user, env) -> boolean
//   Phase 0–3: return Boolean(user)   // any logged-in user, max 5 watches
//   Phase 4:   return isSubscriber(user, env)  // reuse getUserEntitlements in auth.js
```

**Ship gate:** table + indexes + RLS exist; a row inserted as user A is invisible to user B; the gate returns true for any logged-in user; create logic blocks a sixth watch.

---

## Phase 1 — Frontend watch CRUD (your strong area)

**Status:** Implemented 2026-06-25.

Implemented notes:
- `src/lib/watch/watchStore.js` uses browser Supabase + RLS for `price_watches`; there is no localStorage mode.
- `src/components/watch/useWatches.js` exposes list/create/update/remove state for watch surfaces.
- `/watches` lists signed-in watches newest first and supports threshold percent, optional target price, pause/resume, and remove.
- Finalized product modals show `Watch price` only when the product has an ASIN and positive numeric price. Preview modals do not show it.
- Duplicate ASIN + marketplace adds return the existing watch. A sixth watch is blocked with plain UI copy.

Ships a **useful watchlist before any alerts exist** — `lastSeenPrice` just shows the add-time price until the job runs.

**Transport:** browser → Supabase directly with RLS (same call your history plan made — less code, RLS required either way). No new backend route.

**New files**
- `src/lib/watch/watchStore.js` — the interface + the Supabase-RLS implementation.
- `src/components/watch/useWatches.js` — hook: `{ watches, create, update, remove, loading }`.
- `src/pages/WatchPage.jsx` — route `/watches`. Reverse-chronological list; each row: image, title, price-when-added vs last-seen, the threshold control (number input defaulting to 5%), a pause toggle, and remove. Mirror `HistoryPage.jsx`.

**Modified files**
- `src/components/home/ProductDetailModal.jsx` — add a **"Watch price"** button for finalized products only. Logged out → open `AuthModal`. Logged in → `watchStore.create({ asin, amazonDomain, productTitle, imageUrl, productUrl, baselinePrice: currentPrice, thresholdPct: 5, targetPrice: null })`. Use the numeric price from product data (`numericPrice` / parsed provider numeric value), not a formatted display string when possible.
- `src/App.jsx` — add the lazy `/watches` route.
- `src/components/SiteLayout.jsx` — add a "Watches" nav item (visible when logged in).

**Ship gate:** logged-in user can add a watch from a finalized product modal, see it on `/watches`, change its threshold % and optional target price, pause it, and remove it. Duplicate add (same product) is a no-op, not an error. A sixth watch is blocked with plain UI copy.

---

## Phase 1.5 — Price freshness contract

Do this before cron/email. The alert job needs a small, explicit contract that returns a trustworthy numeric price:

```js
// backend/lib/price-watch/price-check-provider.js
// checkAmazonPricesByAsin({ asins, amazonDomain }) -> Map<asin, {
//   asin: string,
//   currentPrice: number|null,
//   currency: 'USD'|'CAD'|string,
//   amazonDomain: string,
//   checkedAt: string,
//   productUrl?: string,
//   source: 'rainforest',
//   unavailableReason?: 'missing_price'|'out_of_stock'|'provider_error'
// }>
```

Rules:
- `currentPrice` must be a positive finite number. Missing, zero, out-of-stock, coupon-only, or ambiguous prices are not alertable.
- The job may read cached product metadata, but price comparisons require a fresh daily provider check or a cache entry written by that same daily run.
- Store price-check evidence separately from modal-enrichment text if the current `product_details_cache` shape stays bullets/description-oriented. If `product_details_cache` is extended, add explicit `price_value`, `price_currency`, `price_checked_at`, and `price_source` columns and freshness rules.
- Rainforest product detail normalization must preserve numeric price before this feature can leave dry-run.

Current implementation note:
- `backend/lib/price-watch/price-check-provider.js` now exposes `checkAmazonPricesByAsin` for fresh Rainforest product-price checks.
- The provider returns positive numeric `currentPrice` only when Rainforest supplies one, and otherwise returns explicit non-alertable reasons (`missing_price`, `out_of_stock`, `provider_error`).
- This is not wired to watches or cron yet.

---

## Phase 2 — Check job (dry-run, no email)

**Status:** Implemented 2026-06-25.

Implemented notes:
- `backend/jobs/check-price-watches.js` reads non-paused watches with the Supabase admin client.
- Watches are deduped by ASIN within each Amazon marketplace before calling the Rainforest price-check provider.
- The job updates `last_checked_at` for every checked active watch and updates `last_seen_price` only when the provider returns a fresh positive numeric price.
- Missing price, out-of-stock, and provider-error results are skipped and never treated as drops.
- Eligible watches are logged as dry-run `would notify` rows; no email is sent, `last_notified_*` is untouched, and `baseline_price` is not reset.
- `render.yaml` includes the daily dry-run cron service `focama-price-watch` at `0 13 * * *`.

The new infrastructure piece. A script, not a public route — nothing new to lock down, and it runs on its own instance instead of competing with live search traffic.

**New file**
- `backend/jobs/check-price-watches.js`

**What it does each run**
1. Read all active (`paused = false`) watches with the admin client.
2. **Dedupe ASINs across users** — two people watching the same product = one price fetch.
3. Re-price in batches via the Rainforest-backed price-check provider (group by `amazon_domain`, since price is per-marketplace).
4. For each watch, compute eligibility (rule below).
5. Update `last_seen_price` / `last_checked_at` on **every** watch regardless of outcome.
6. In dry-run: **log** which watches *would* notify; send nothing; do not touch `last_notified_*` yet.

**Eligibility rule (exact)**
```
freshPrice = normalized price for the ASIN this run
if freshPrice is missing / 0 / out-of-stock:  skip  (do NOT treat as a drop)
dropFromBaseline = (baseline_price - freshPrice) / baseline_price * 100
meetsPct    = dropFromBaseline >= threshold_pct
meetsTarget = target_price != null && freshPrice <= target_price
crossed     = meetsPct || meetsTarget
eligible    = crossed
```

> Two failure modes this guards against: (a) a missing/zero price must never be read as a 100% drop — skip it; (b) the baseline reset after notify is the debounce — a product that settles lower won't re-email every day.

**Scheduling:** no separate Render Cron service. The existing Render web service exposes:
```http
POST /api/internal/check-price-watches
Authorization: Bearer $PRICE_WATCH_INTERNAL_TOKEN
```

The active scheduler is `.github/workflows/price-watch.yml`, which calls the endpoint daily at 13:00 UTC and also supports manual runs. Its URL and Bearer token come from the `FOCAMAI_PRICE_WATCH_URL` and `FOCAMAI_PRICE_WATCH_TOKEN` GitHub Actions secrets.

**Ship gate:** seed a watch with a baseline above the current real price; run the job manually; confirm the log says it *would* notify, `last_seen_price`/`last_checked_at` updated, and a missing-price ASIN is skipped (no fake drop).

---

## Phase 3 — Email (live)

**Status:** Implemented 2026-06-26 behind an explicit env gate.

Implemented notes:
- `backend/lib/price-watch/price-drop-email.js` renders and sends Resend price-drop emails.
- `backend/jobs/check-price-watches.js` now uses the same daily job for dry-run or live-send mode.
- Live sending only happens when `PRICE_WATCH_EMAILS_ENABLED=true`.
- Sender and manage URL are configurable with `PRICE_WATCH_FROM_EMAIL` and `PRICE_WATCH_MANAGE_URL`.
- Default manage URL is `https://focamai.com/watches`.
- Default sender is `contact@focamai.com`; switch `PRICE_WATCH_FROM_EMAIL` to `alerts@focamai.com` only after Resend/domain setup confirms it can send.
- After a successful send, the job sets `last_notified_price`, `last_notified_at`, and resets `baseline_price` to the notified price.
- If email sending fails, the job keeps the old baseline/notification fields and only leaves the check/last-seen update, so the next run can try again.

**New files**
- `backend/lib/price-watch/price-drop-email.js` — Resend sender plus `sendPriceDropEmail({ to, productTitle, oldPrice, newPrice, productUrl, manageUrl })`.

**Job change**
- For eligible watches, send the email, then set `last_notified_price = freshPrice`, `last_notified_at = now()`, and reset `baseline_price = freshPrice`. Flip the job out of dry-run.
- The user's email comes from the auth user — read it alongside the watch (admin client can join `auth.users`).

**Email must include**
- Product title, old → new price, a buy button on `productUrl` (carries the affiliate tag), and a **manage/unsubscribe link to `/watches`**. The manage link is a deliverability + legal requirement, not optional.

**One-time setup (flag for Zvi)**
- Verify a sending domain (focamai.com) in Resend via DNS records. Skip this and alerts land in spam. Resend walks through the records.

**Ship gate:** a real drop produces exactly one email with correct prices and a working affiliate button; `last_notified_*` updates; a second run at the same price does **not** re-email.

---

## Phase 4 — Subscriber gate (deferred)

- Flip `canUsePriceWatch` from `Boolean(user)` to `isSubscriber(user, env)` (reuse `getUserEntitlements` in `auth.js`).
- Replace the v1 **5-watch limit** with per-tier limits if/when subscriber gating ships.
- Testers keep access via `DEEP_DIVE_SUBSCRIBER_EMAILS`.
- No UI rework — the button + page already exist; they just gate.

---

## Why this order

Phases 0–1 deliver a working, useful watchlist with zero new infrastructure — all the user-visible risk is retired before cron or email (the two genuinely new pieces) are touched. Phase 2 proves the pricing/debounce logic in dry-run before a single email can go out. Phase 3 is the last mile. Phase 4 is a gate flip, not a build.

## Env vars added across the feature
```
RESEND_API_KEY            # Phase 3
PRICE_WATCH_EMAILS_ENABLED=true
PRICE_WATCH_FROM_EMAIL=contact@focamai.com
PRICE_WATCH_MANAGE_URL=https://focamai.com/watches
PRICE_WATCH_INTERNAL_TOKEN=long-random-secret
# (cron job reuses SUPABASE_* and RAINFOREST_API_KEY already in use)
```

## Notes to update when this ships
- `project-notes/db-needs.md` — add `price_watches`.
- `project-notes/current-status.md` — snapshot.
- `render.yaml` — the new cron service (record it as the off-peak job).
- `CLAUDE.md` env list — `RESEND_API_KEY`.
