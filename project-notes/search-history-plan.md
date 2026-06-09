# Search History — Implementation Plan

**Written:** 2026-06-09
**Status:** Phase 0/1 first pass implemented 2026-06-09; frontend auth shell started 2026-06-09; DB history phase not started
**Sequence:** localStorage → auth → DB (each phase ships on its own)

---

## Locked product decisions

- **Save trigger:** auto-save on finalize. One entry = one completed search (the 6 picks). Abandoned/in-flight searches are not saved.
- **Dedupe:** upsert on a normalized key of `query + follow-up`. A repeat of the same search updates the existing entry (fresh picks, new timestamp, moved to top) instead of adding a duplicate row.
- **Reopen behavior:** show the saved picks immediately, with a "re-run" button. Re-running upserts the same entry.
- **Search stays ungated** (unchanged from `auth-plan.md`). History is the first thing login unlocks.

### Deferred decisions (don't block phase 1)
- **Phase 3 transport:** backend routes (`/api/history` + `requireAuth`) vs. browser → Supabase directly with RLS. Recommendation: direct-via-RLS (less code; RLS is required either way).
- **Phase 3 migration:** merge device (localStorage) history into the account on first login. Recommendation: yes, one-time merge, then clear local.

---

## The one idea that makes the sequence painless: a storage interface

Everything in the UI talks to a single abstraction, never to localStorage or Supabase directly:

```js
// src/lib/history/historyStore.js  (the interface — phase 0)
//   list()            -> Promise<Entry[]>   (newest first)
//   save(entry)       -> Promise<Entry>     (upsert by queryKey)
//   remove(id)        -> Promise<void>
//   clear()           -> Promise<void>
```

- **Phase 1** provides `localHistoryStore` (localStorage) behind this interface.
- **Phase 3** provides `remoteHistoryStore` (Supabase) behind the *same* interface.
- A tiny selector picks the implementation: logged out → local, logged in → remote.
- The history page and the save-on-finalize hook are written **once** against the interface and never change when the backend swaps.

All methods are `async` from day one (localStorage is sync, but wrapping it in promises means the remote swap needs zero call-site edits).

---

## Shared data shape (identical in localStorage and DB)

```js
{
  id:           string,   // crypto.randomUUID()
  queryKey:     string,   // normalized(query) + '\u0001' + normalized(followUp)  — dedupe key
  query:        string,   // raw display query
  followUp:     string,   // raw follow-up answer/notes ('' if none)
  amazonDomain: string,   // marketplace at search time
  results:      Array,    // the finalized picks payload
  createdAt:    string,   // ISO
  updatedAt:    string,   // ISO
}
```

Normalization (shared helper, used for the dedupe key in every phase):
`lowercase` → `trim` → collapse internal whitespace to single spaces.

This maps 1:1 onto the phase-3 table, so migration is a field copy.

---

## Phase 0 — Foundations (do once, before phase 1)

**New files**
- `src/lib/history/historyEntry.js` — `makeQueryKey(query, followUp)`, `createEntry({...})`, normalization helper.
- `src/lib/history/historyStore.js` — the interface + the implementation selector.

No UI yet. This is pure plumbing the next phases build on.

---

## Phase 1 — localStorage history

**Goal:** working, useful history with zero auth. Survives reloads on the same device.

**New files**
- `src/lib/history/localHistoryStore.js`
  - Backed by a **versioned** key: `focamai:searchHistory:v1`.
  - `save()` reads the array, upserts by `queryKey` (update + move to front, or prepend), writes back.
  - **Cap at ~50 entries** (drop oldest). Results payloads are chunky and localStorage is ~5MB; the cap prevents quota errors.
  - Wrap reads/writes in try/catch — corrupt/oversized data must degrade gracefully, never crash the app.
- `src/components/history/useSearchHistory.js` — hook exposing `{ entries, save, remove, clear, loading }`, talking to `historyStore` (not localStorage directly).
- `src/pages/HistoryPage.jsx` — route `/history`. Reverse-chronological list; each row shows query, follow-up, date; expand to see picks; per-row delete; re-run button.

**Modified files**
- `src/components/home/useGuidedSearch.js` — in `applyFinalizePayload` (~line 1023, where `setResults(finalizedResults)` runs), also call `historyStore.save(...)` with `variables.query`, `variables.followUpNotes`, the finalized results, and the resolved Amazon domain. This is the single save hook point — everything needed is already in scope there.
- `src/App.jsx` — add `<Route path="/history" element={<HistoryPage />} />` (lazy, like the other pages).
- `src/components/SiteLayout.jsx` — add a "History" item to `navItems` (~line 87). In phase 1 it's always visible.

**Re-run wiring**
- Re-run navigates home with the saved `query` + `followUp` prefilled and kicks off the guided search. On finalize, the upsert refreshes the same entry. (Confirm exactly how `HomePage` accepts an initial query — it currently lifts `initialSearchQuery` state; may need a small prop/route-state path for the follow-up too.)

**Ship gate:** save on finalize works, history page lists/expands/deletes/re-runs, dedupe verified (same search twice = one entry, refreshed).

---

## Phase 2 — Auth (Supabase)

**Goal:** users can sign in; nothing about history storage changes yet (still localStorage).

First-pass frontend shell exists: `AuthProvider`, `useAuth`, lazy Supabase browser client, `AuthModal`, and header sign-in/sign-out UI. Real Supabase sign-in QA still requires frontend env vars and dashboard/OAuth setup.

**New files**
- `src/lib/supabase.js` — single browser client from `VITE_SUPABASE_URL` + `VITE_SUPABASE_ANON_KEY`. (Anon key only in the browser — never the secret key.)
- `src/contexts/AuthContext.jsx` — provider only. Exposes `user`, `session`, `signIn`, `signUp`, `signInWithGoogle`, `signOut`, `loading`. Subscribes to `supabase.auth.onAuthStateChange`.
- `src/contexts/useAuth.js` — the hook, in a **separate file**. (Matches your existing convention — see `AmazonStoreContext.jsx` + `useAmazonStore.js`. Splitting keeps the react-refresh eslint rule happy: `.jsx` exports only components.)
- `src/components/auth/AuthModal.jsx` — tabs: Sign in / Create account; email+password and a Google button; loading + error states.

**Modified files**
- `src/main.jsx` — wrap `<App />` with `<AuthProvider>` (inside `BrowserRouter`, around the existing tree).
- `src/components/SiteLayout.jsx` — header shows a "Sign in" button when logged out, avatar/menu with "Sign out" when logged in.

**Backend (only needed if phase 3 uses backend routes)**
- `backend/middleware/requireAuth.js` — reads the bearer token, calls `supabase.auth.getUser(token)`, attaches `req.user`, 401s otherwise. Reuse the client pattern in `backend/lib/search-storage.js`. Apply to protected routes only; all existing search routes stay open.

**Supabase dashboard**
- Enable email/password + Google provider; add Google client id/secret.
- Add redirect URLs for localhost and `focamai.com`.

**Ship gate:** sign up, sign in (both methods), sign out, session persists across reload. History still local — auth and history are decoupled until phase 3.

---

## Phase 3 — DB storage

**Goal:** logged-in users' history lives in Supabase and syncs across devices. Logged-out users keep local history.

### Table — `saved_searches` (NOT `search_history`)

> `public.search_history` already exists as an internal cache/debug log (`backend/lib/search-storage.js`, defined in `db-needs.md`). It has no `user_id` and the backend writes to it. Creating a user-facing `search_history` as the old `auth-plan.md` suggested would collide with it. Use `saved_searches`.

```sql
create table if not exists public.saved_searches (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null references auth.users(id) on delete cascade,
  query_key    text not null,                 -- normalized query + follow-up (dedupe)
  query        text not null,
  follow_up    text not null default '',
  amazon_domain text not null default '',
  results      jsonb not null default '[]'::jsonb,
  created_at   timestamptz not null default timezone('utc', now()),
  updated_at   timestamptz not null default timezone('utc', now())
);

create unique index if not exists saved_searches_user_query_key_idx
  on public.saved_searches (user_id, query_key);

create index if not exists saved_searches_user_updated_at_idx
  on public.saved_searches (user_id, updated_at desc);

alter table public.saved_searches enable row level security;

create policy "read own saved searches"   on public.saved_searches
  for select using (auth.uid() = user_id);
create policy "insert own saved searches" on public.saved_searches
  for insert with check (auth.uid() = user_id);
create policy "update own saved searches" on public.saved_searches
  for update using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "delete own saved searches" on public.saved_searches
  for delete using (auth.uid() = user_id);
```

The unique index on `(user_id, query_key)` is what makes server-side upsert work — same dedupe rule as phase 1.

### Remote store implementation

**New file**
- `src/lib/history/remoteHistoryStore.js` — same interface as `localHistoryStore`.

Recommended transport: **browser → Supabase directly** (RLS enforces ownership):
```js
await supabase.from('saved_searches').upsert(
  { user_id, query_key, query, follow_up, amazon_domain, results,
    updated_at: new Date().toISOString() },
  { onConflict: 'user_id,query_key' }
)
```
(If you prefer server-side: add `/api/history` GET/POST/DELETE behind `requireAuth` and have `remoteHistoryStore` call those instead. Same interface either way.)

**Modified files**
- `src/lib/history/historyStore.js` — selector returns `remoteHistoryStore` when `useAuth().user` exists, else `localHistoryStore`. This is the whole swap. The history page and the finalize save hook are untouched.

### One-time migration on first login (recommended)
On the auth state flipping to signed-in: read local entries, upsert any whose `queryKey` isn't already in the account, then clear the local store. Idempotent because of the unique index.

**Ship gate:** logged-in history persists in Supabase and appears on a second device; logged-out history still works locally; the merge runs once and doesn't duplicate.

---

## Files touched, at a glance

**New**
- `src/lib/history/historyEntry.js`, `historyStore.js`, `localHistoryStore.js`, `remoteHistoryStore.js`
- `src/components/history/useSearchHistory.js`
- `src/pages/HistoryPage.jsx`
- `src/lib/supabase.js`
- `src/contexts/AuthContext.jsx`, `src/contexts/useAuth.js`
- `src/components/auth/AuthModal.jsx`
- `backend/middleware/requireAuth.js` *(only if backend-routes transport chosen)*

**Modified**
- `src/components/home/useGuidedSearch.js` (save hook in `applyFinalizePayload`)
- `src/App.jsx` (route), `src/main.jsx` (AuthProvider)
- `src/components/SiteLayout.jsx` (nav item + auth button)

---

## Env vars to add (frontend)
```env
VITE_SUPABASE_URL=https://your-project-ref.supabase.co
VITE_SUPABASE_ANON_KEY=your-anon-key
```
Backend already has `SUPABASE_URL` + `SUPABASE_SECRET_KEY` (see `db-needs.md`) — no backend env change unless you add `/api/history` routes.

---

## Read before starting
- `project-notes/auth-plan.md` — prior thinking (note the `search_history` naming trap above)
- `project-notes/db-needs.md` — current tables; confirms the collision
- `src/components/home/useGuidedSearch.js` — the finalize flow (save hook lives here)
- `src/contexts/AmazonStoreContext.jsx` + `useAmazonStore.js` — the context/hook split convention to mirror for auth
