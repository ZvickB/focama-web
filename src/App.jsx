import { Suspense, lazy, useEffect } from 'react'
import { Route, Routes } from 'react-router-dom'
import { Analytics } from '@vercel/analytics/react'
import { SpeedInsights } from '@vercel/speed-insights/react'
import SiteLayout from '@/components/SiteLayout.jsx'
import { AmazonStoreProvider } from '@/contexts/AmazonStoreContext.jsx'
import { SearchProgressProvider } from '@/contexts/SearchProgressContext.jsx'

const HomePage = lazy(() => import('@/pages/HomePage.jsx'))
const AffiliateDisclosurePage = lazy(() => import('@/pages/AffiliateDisclosurePage.jsx'))
const ContactPage = lazy(() => import('@/pages/ContactPage.jsx'))
const InstallPage = lazy(() => import('@/pages/InstallPage.jsx'))
const NotFoundPage = lazy(() => import('@/pages/NotFoundPage.jsx'))
const PrivacyPage = lazy(() => import('@/pages/PrivacyPage.jsx'))
const WhyFocamaiPage = lazy(() => import('@/pages/WhyFocamaiPage.jsx'))
const AnalyticsPage = import.meta.env.DEV
  ? lazy(() => import('@/pages/AnalyticsPage.jsx'))
  : null

const SPLASH_MIN_DURATION_MS = 0 // was 800; zeroed out while splash is disabled
const SPLASH_HIDE_DURATION_MS = 440

export function RouteLoadingFallback() {
  return (
    <div
      aria-live="polite"
      className="flex min-h-screen items-center justify-center bg-white px-6 py-12 text-center text-stone-900"
      role="status"
    >
      <div className="w-full max-w-sm space-y-4">
        <div className="mx-auto h-10 w-10 animate-spin rounded-full border-2 border-stone-200 border-t-stone-900" />
        <div className="space-y-1">
          <p className="text-sm font-semibold">Loading Focamai</p>
          <p className="text-sm leading-6 text-stone-500">Getting the next screen ready.</p>
        </div>
      </div>
    </div>
  )
}

function AppRoutes({ onReady }) {
  useEffect(() => {
    return onReady()
  }, [onReady])

  return (
    <Routes>
      <Route element={<SiteLayout />}>
        <Route path="/" element={<HomePage />} />
        {import.meta.env.DEV && AnalyticsPage ? (
          <Route path="/admin/analytics" element={<AnalyticsPage />} />
        ) : null}
        <Route path="/why" element={<WhyFocamaiPage />} />
        <Route path="/contact" element={<ContactPage />} />
        <Route path="/install" element={<InstallPage />} />
        <Route path="/privacy" element={<PrivacyPage />} />
        <Route path="/affiliate-disclosure" element={<AffiliateDisclosurePage />} />
        <Route path="*" element={<NotFoundPage />} />
      </Route>
    </Routes>
  )
}

function App() {
  function handleRoutesReady() {
    const splashElement = document.getElementById('app-boot-splash')

    if (!splashElement) {
      return
    }

    const splashStartedAt = Number(window.__focamaiSplashStartedAt || 0)
    const elapsed = Math.max(0, performance.now() - splashStartedAt)
    const remainingDelay = Math.max(0, SPLASH_MIN_DURATION_MS - elapsed)

    const hideTimer = window.setTimeout(() => {
      splashElement.classList.add('is-hidden')
      splashElement.setAttribute('aria-hidden', 'true')
      const rootElement = document.getElementById('root')
      if (rootElement) rootElement.classList.add('is-visible')
    }, remainingDelay)

    const removeTimer = window.setTimeout(() => {
      splashElement.remove()
    }, remainingDelay + SPLASH_HIDE_DURATION_MS)

    return () => {
      window.clearTimeout(hideTimer)
      window.clearTimeout(removeTimer)
    }
  }

  return (
    <AmazonStoreProvider>
      <SearchProgressProvider>
        <Suspense fallback={<RouteLoadingFallback />}>
          <AppRoutes onReady={handleRoutesReady} />
        </Suspense>
        <Analytics />
        <SpeedInsights />
      </SearchProgressProvider>
    </AmazonStoreProvider>
  )
}

export default App
