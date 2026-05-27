# Feature Efficiency Audit

Tracks whether features were implemented with loading and runtime efficiency in mind.
This is NOT about functional correctness — tests cover that.
It's about: lazy loading, first paint impact, unnecessary work, event listener hygiene, re-renders.
Also checks cleanup: timers, event listeners, and in-flight requests that don't get torn down on unmount.

Run an audit by telling Claude: "run an efficiency audit on project-notes/feature-audit.md"

**Status key:** `✓ clean` | `⚠ check` | `🔧 fixed`

---

## Post May-2 Features

| Feature | Efficiency / cleanup concern | Status |
|---|---|---|
| PWA manifest + service worker | Does SW cache API responses it shouldn't? Caching strategy correct? | ✓ clean |
| Install link in mobile nav | Hook called unconditionally in `SiteLayout` even on desktop where it's unused | ✓ clean |
| Amazon marketplace toast | Toast component mounts a timer on every render of the header — does it clean up correctly if the toast re-mounts? | ✓ clean |
| Feedback FAB | Is it loaded on every page? Should it be lazy or conditionally mounted? | ⚠ check |
| Vercel Analytics + Speed Insights | Both in `App.jsx` — do they block or defer? Are they no-ops in dev? | ✓ clean |
| SEO meta tags | Per-route — are they injected in a way that causes extra renders? | ✓ clean |
| Backend prewarm on mount | Fires `useEffect` on homepage mount — correct. Does it fire on route re-visits or just first mount? | ✓ clean |
| Query quality suggestions | Does the suggestion check add a round-trip before every search, or only on short/vague queries? | ✓ clean |
| Char counter below inputs | Purely derived from input value — no state, just render? Or does it use `useState`? | ✓ clean |
| Step indicator in compact header | Reads from context on every scroll event — is the context value stable (memo'd)? | ✓ clean |
| Scroll hint chevron | `pointer-events-none` → real button; scroll listeners attached to both mobile + desktop refs ✓ | 🔧 fixed 2026-05-13 |
| Result hint visibility | Simple boolean state, low risk | ✓ clean |
| Price filter (backend) | Backend-only, no frontend cost | ✓ clean |

---

_Audited through this point — 05/13/2026_
