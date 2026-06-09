# Auth & User Features — Implementation Plan

**Written:** 2026-05-07
**Status:** Frontend auth shell first pass implemented 2026-06-09; Supabase dashboard/env setup and real sign-in QA still pending; saved-search table/API guidance partially superseded

> Note: the user-facing saved-search table guidance in this older plan is superseded by `project-notes/search-history-plan.md`. Do not create a user-facing `search_history` table; that name is already used for internal telemetry/cache visibility. Use `saved_searches` for account-backed saved searches.

---

## Product decisions (locked)

- Search is **not gated** — anyone can search without an account
- Login unlocks: search history, and later gated features (review summaries, multi-retailer)
- Login methods: email/password + Google OAuth
- Session is handled by Supabase auth client — no handrolling

---

## What we are NOT building yet

- Anonymous search claiming (saving pre-login searches after signup)
- Per-user rate limiting
- Account deletion / data export
- Review summaries or multi-retailer search (stubs only, if needed)

---

## Database changes (same Supabase project, no new instance)

### No new tables from Supabase auth
Supabase creates and manages `auth.users` automatically when you enable auth. Nothing to create.

### Saved-search table
Do not use this older plan for the saved-search schema. The user-facing history table should be `saved_searches`, defined in `project-notes/search-history-plan.md`.

Current sequence:
- Phase 1 local history is already started: `/history` reads/writes localStorage on the current device.
- Auth phase should add login/session UI only; history can remain local during this phase.
- DB-backed account history comes after auth and should use `saved_searches` with RLS.

### Existing tables
`tester_feedback`, discovery cache, and ASIN cache tables are untouched.

---

## Implementation steps

### Step 1 — Supabase auth setup
- Enable auth in Supabase dashboard
- Configure Google OAuth (add Google client ID + secret)
- Add redirect URLs for localhost and production (focamai.com)
- Add env vars: `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY` to frontend (Vercel and local `.env`)
- Supabase URL and service key already in backend — no change needed there

### Step 2 — Frontend: Supabase client + AuthContext
- `@supabase/supabase-js` is already installed.
- `src/lib/supabase.js` now lazy-loads the Supabase browser client so auth does not bloat the initial app chunk.
- `src/contexts/AuthContext.jsx` and `src/contexts/useAuth.js` exist and expose `useAuth()`.
  - Provides: `user`, `session`, `signIn`, `signUp`, `signOut`, `loading`
- `src/main.jsx` wraps the app with `AuthProvider`.

### Step 3 — Login/signup UI
- `src/components/auth/AuthModal.jsx` exists.
- Header nav opens the modal from a `Sign in` button.
- Tabs: Sign in / Create account.
- Fields: email + password, plus Google button.
- Handles loading and error states.
- If frontend Supabase env vars are missing, the modal shows setup copy instead of crashing.
- Post-finalize "sign in to sync/save across devices" nudge is not implemented yet.

### Step 4 — Backend: JWT verification middleware (only when a protected backend route is needed)
- Create `backend/middleware/requireAuth.js`
- Calls `supabase.auth.getUser(token)` with the bearer token from the request header
- Returns 401 if invalid or missing
- Apply only to protected routes (later gated features, or saved-search routes if the backend-route transport is chosen)
- All existing search routes stay unprotected

### Step 5 — Saved history integration
- Do not implement this from the old `/api/history` + `search_history` notes.
- Follow `project-notes/search-history-plan.md` instead.
- Recommended sequence:
  - keep localStorage history working through the auth phase
  - later add `remoteHistoryStore`
  - use direct browser-to-Supabase writes with RLS unless there is a clear reason to add backend routes
  - store account-backed rows in `saved_searches`

### Step 6 — History page
- `/history` already exists for device-local history.
- Do not protect the route during the auth-only phase.
- After DB-backed history exists, logged-in users should see account history and logged-out users should keep device-local history.

### Step 7 — Gated feature stubs
- Establish the pattern before building the features
- If a logged-out user tries a gated feature: show auth modal with clear value message
- If logged in: feature runs normally
- No actual review summary or multi-retailer logic yet — just the gate

---

## Files that will change or be created

**New files:**
- `src/lib/supabase.js` *(created)*
- `src/contexts/AuthContext.jsx` *(created)*
- `src/contexts/useAuth.js` *(created)*
- `src/components/auth/AuthModal.jsx` *(created)*
- `backend/middleware/requireAuth.js` *(only if protected backend routes are chosen)*

**Modified files:**
- `src/main.jsx` — wrapped with AuthProvider
- `src/components/SiteLayout.jsx` — sign-in button, signed-in email chip, sign-out action
- `src/components/home/` — later add "sign in to sync/save across devices" nudge if desired

---

## What to read before starting

- `project-notes/app_flow.md` — current finalize flow (Step 5 hooks in here)
- `project-notes/current-status.md` — active constraints
- Supabase dashboard → Authentication settings
- `.env` / Vercel frontend env vars for `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY`

---

## Open questions

- Real Supabase sign-up/sign-in QA is still pending because local frontend env vars were not present when the UI was added.
- Does the "sign in to save" nudge appear on the results page, or as a toast?
- Should history be paginated from the start, or is infinite scroll fine for v1?
