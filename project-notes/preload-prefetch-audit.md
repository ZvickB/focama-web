# Preload & Prefetch Audit

_Written 2026-05-11. Based on code as-of main branch._

This is an audit of what preloading and prefetching is in place, what's missing, and what's worth adding. The lazy-loading split was done intentionally; this doc asks whether anything beneficial was left on the table.

---

## What the loading split currently looks like

### Eager (main bundle)
- `main.jsx`, `App.jsx`
- `SiteLayout`, `ErrorBoundary`, `AmazonStoreContext`, `SearchProgressContext`
- All UI primitives (`button`, `textarea`, etc.) — pulled in by `HomeShell` which is sync-imported by `HomePage`

### Route-level lazy (App.jsx)
All page components are `lazy()` chunks: `HomePage`, `AboutPage`, `WhyFocamaiPage`, `ContactPage`, `PrivacyPage`, `AffiliateDisclosurePage`, `NotFoundPage`.

### Within-HomePage lazy (HomePage.jsx)
`HomeExperience` is lazy — only triggered when the user submits a search query (`hasStartedSearch`). Until then, the lean `HomeShell` renders immediately from a sync import.

### Within-HomeExperience lazy (HomeExperience.jsx)
- `ResultsSection` — rendered inside `<Suspense>` once `shouldLoadResultsSection` is true (search started)
- `ProductDetailModal` — rendered inside `<Suspense>` only when a product is selected

---

## What preloading / prefetching is actually in place

| Mechanism | Status |
|---|---|
| Vite `<link rel="modulepreload">` for entry chunk | **Present** — Vite handles this for the main JS entry |
| `<link rel="modulepreload">` for lazy route chunks | **Absent** — no hints for HomePage, AboutPage, etc. |
| `<link rel="preconnect">` for Google Fonts | **Absent** |
| `<link rel="preload">` for Google Fonts CSS | **Absent** |
| `<link rel="preload">` for wordmark image | **Absent** |
| `fetchpriority="high"` on wordmark `<img>` | **Absent** |
| Manual `import()` prefetch for HomeExperience | **Absent** |
| Manual `import()` prefetch for ResultsSection | **Absent** |
| `<link rel="dns-prefetch">` for backend (Render) | **Absent** |
| PWA service worker (Workbox) | **Present** — caches all JS/CSS/HTML/SVG/PNG/WOFF2 after first visit |
| Workbox runtime cache for Google Fonts | **Present** — CacheFirst, but only kicks in after the font is first loaded |

---

## Issues by priority

### 1. Google Fonts: no preconnect and a slow discovery chain (High)

The font import lives in `src/index.css` as `@import url(...)`. The browser has to:
1. Download and parse the JS bundle
2. Inject the CSS link
3. Discover the `@import`
4. Fetch the Google Fonts CSS file
5. Parse that file to find the actual `.woff2` URLs
6. Download the fonts

`index.html` already sets `font-family: "Instrument Sans"` via inline CSS, so any text rendered before the font arrives will flash to the web font on load (FOUT).

**Fix:** Add preconnect hints to `index.html` _above_ the stylesheet:
```html
<link rel="preconnect" href="https://fonts.googleapis.com" />
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
```
Optionally move the `@import` out of `index.css` and into a `<link rel="stylesheet">` in `index.html` so the browser discovers it one step earlier. The preconnect alone buys ~100–200ms on a cold connection.

---

### 2. Wordmark image: LCP candidate with no priority (High)

The wordmark (`wordmark.PNG`) is the first meaningful visual on every page visit. It's loaded inside `HomeShell` (and again identically in `HomeExperience`) with a plain `<img>` — no priority hints.

The browser treats it as a normal-priority image, which means it can be queued behind JS/CSS resources even though it's the most important visual element.

**Fix:** Add `fetchpriority="high"` to the wordmark `<img>` in `HomeShell.jsx` (the first-render path):
```jsx
<img
  fetchpriority="high"
  src={wordmark}
  alt="Focamai"
  ...
/>
```
This is a one-liner and directly improves LCP. You could also add a `<link rel="preload" as="image">` for the hashed asset in `index.html` but that requires knowing the Vite-hashed filename at build time — the `fetchpriority` attribute alone is simpler and nearly as effective.

---

### 3. HomeExperience chunk: no prefetch while user is on idle home screen (Medium)

`HomeExperience` is only fetched after the user submits a search. On a slow connection, hitting "Start search" triggers a visible loading gap while the chunk downloads.

The `HomeShell` with `isStarting` is shown as a fallback (good), but the chunk itself could be prefetched silently while the user is typing.

**Fix:** Add a `useEffect` inside `HomeShell` (or `HomePage`) that fires a prefetch import once the component mounts:
```js
useEffect(() => {
  // warm up the HomeExperience chunk while user is on the idle home screen
  import('@/components/home/HomeExperience.jsx')
}, [])
```
This is a low-risk change — it doesn't change render behavior, it just starts downloading the chunk in the background. The browser's idle-time scheduler handles the rest.

---

### 4. ResultsSection and ProductDetailModal: no prefetch (Medium)

`ResultsSection` is fetched the moment a search starts. At that point the user is already waiting for an API response — the chunk load and the API response race. If the chunk wins, there's no visible gap. If the API wins first (e.g. fast cache hit), there's a brief flash.

`ProductDetailModal` is fetched on product click. The modal open is the most interaction-sensitive moment in the app.

**Fix:** In `HomeExperience.jsx`, once the component mounts, prefetch both:
```js
useEffect(() => {
  import('@/components/home/ResultsSection.jsx')
  import('@/components/home/ProductDetailModal.jsx')
}, [])
```
`HomeExperience` is only mounted after the user starts a search, so these prefetches run at a natural point and don't inflate the initial page load.

---

### 5. Route chunks: no prefetch on hover / idle (Low)

Nav links for `/why`, `/contact`, `/privacy` are rendered eagerly in `SiteLayout`. Their page chunks are never prefetched. On first click, the user waits for the chunk + React to render.

These pages are lightweight and low-traffic — the gap is small. But it's easy to fix at the router level if it ever matters.

**Not blocking.** If you want to address it later, React Router v7 supports `<Link prefetch="intent">` which prefetches on hover. Worth knowing it exists.

---

### 6. Backend preconnect: possible first-search latency (Low)

The Render backend URL is set via `VITE_BACKEND_URL` at build time. The first API call from a cold browser (no prior visit) pays a full DNS + TCP + TLS handshake against Render before any data flows.

A `<link rel="preconnect">` for the backend origin would eliminate that overhead. The tricky part is that the URL is a build-time env var and `index.html` is static — this would require a Vite plugin or a post-build transform to inject it.

**Not blocking** — the user's search query input provides a natural delay. Worth revisiting if first-search latency becomes a focus.

---

## What's already working well

- **Workbox PWA caching** is in place and covers all bundled assets. Returning visitors get instant loads.
- **`HomeShell` / `HomeExperience` split** is the right call — the idle home screen is fast and light. The lazy boundary is at exactly the right point.
- **`ResultsSection` and `ProductDetailModal` are lazy inside `HomeExperience`** — they don't bloat the initial search chunk.
- The `Suspense` fallbacks are meaningful (loading skeletons, not blank screens), so chunk load gaps don't look broken.

---

## Recommended action order

1. `<link rel="preconnect">` for Google Fonts in `index.html` — 5 min, measurable improvement
2. `fetchpriority="high"` on the wordmark `<img>` in `HomeShell.jsx` — 1 min, direct LCP improvement
3. Prefetch `HomeExperience` on idle home mount — ~5 lines in `HomePage.jsx`
4. Prefetch `ResultsSection` + `ProductDetailModal` on `HomeExperience` mount — ~5 lines
5. Everything else is low priority
