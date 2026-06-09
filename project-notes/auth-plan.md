# Auth & User Features — Implementation Plan

**Written:** 2026-05-07
**Status:** Not started

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

### One new table: `search_history`

```sql
create table public.search_history (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete cascade not null,
  created_at timestamptz default now(),
  query text not null,
  followup_question text,
  followup_answer text,
  results jsonb not null  -- the 6 finalized picks, full payload
);

-- Row-level security: users can only see their own rows
alter table public.search_history enable row level security;

create policy "Users can read own history"
  on public.search_history for select
  using (auth.uid() = user_id);

create policy "Users can insert own history"
  on public.search_history for insert
  with check (auth.uid() = user_id);

create policy "Users can delete own history"
  on public.search_history for delete
  using (auth.uid() = user_id);
```

### Existing tables
`tester_feedback`, discovery cache, and ASIN cache tables are untouched.

---

## Implementation steps

### Step 1 — Supabase auth setup
- Enable auth in Supabase dashboard
- Configure Google OAuth (add Google client ID + secret)
- Add redirect URLs for localhost and production (focamai.com)
- Add env vars: `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY` to frontend (Vercel)
- Supabase URL and service key already in backend — no change needed there

### Step 2 — Frontend: Supabase client + AuthContext
- Install `@supabase/supabase-js`
- Create `src/lib/supabase.js` — single client instance
- Create `src/context/AuthContext.jsx` — wraps app, exposes `useAuth()` hook
  - Provides: `user`, `session`, `signIn`, `signUp`, `signOut`, `loading`
- Wrap `App` or router root with `AuthProvider`

### Step 3 — Login/signup UI
- Modal-based (doesn't interrupt the search flow)
- Triggered by: nav button, "sign in to save" nudge after finalize
- Tabs: Sign in / Create account
- Fields: email + password, or Google button
- Handles: loading, error states, redirect after login

### Step 4 — Backend: JWT verification middleware
- Create `backend/middleware/requireAuth.js`
- Calls `supabase.auth.getUser(token)` with the bearer token from the request header
- Returns 401 if invalid or missing
- Apply only to protected routes (history save, later gated features)
- All existing search routes stay unprotected

### Step 5 — Save history on finalize
- After `/api/search/finalize` succeeds and returns 6 picks:
  - Frontend checks if user is logged in
  - If yes: POST to new `/api/history` endpoint with query, follow-up, and results
  - If no: show subtle "sign in to save this search" nudge (not a wall)
- Backend `/api/history` endpoint:
  - Protected by `requireAuth` middleware
  - Inserts one row into `search_history`
  - Returns `{ saved: true }`

### Step 6 — History page
- Route: `/history`
- Protected: redirect to login if not authenticated
- Shows saved searches in reverse-chronological order
- Each row: query, date, expandable to see the 6 picks
- Fetches from `/api/history` (GET, protected)

### Step 7 — Gated feature stubs
- Establish the pattern before building the features
- If a logged-out user tries a gated feature: show auth modal with clear value message
- If logged in: feature runs normally
- No actual review summary or multi-retailer logic yet — just the gate

---

## Files that will change or be created

**New files:**
- `src/lib/supabase.js`
- `src/context/AuthContext.jsx`
- `src/components/auth/AuthModal.jsx`
- `src/pages/HistoryPage.jsx`
- `backend/middleware/requireAuth.js`

**Modified files:**
- `src/main.jsx` or `App.jsx` — wrap with AuthProvider
- `src/components/home/` — add post-finalize "save" nudge
- `backend/express-server.js` — add `/api/history` routes
- `backend/server.js` — add history handler functions
- Nav component (whatever that is) — add login button / user avatar

---

## What to read before starting

- `project-notes/app_flow.md` — current finalize flow (Step 5 hooks in here)
- `project-notes/current-status.md` — active constraints
- Supabase dashboard → Authentication settings

---

## Open questions

- Where does the login button live in the current nav? (need to check actual component)
- Does the "sign in to save" nudge appear on the results page, or as a toast?
- Should history be paginated from the start, or is infinite scroll fine for v1?
