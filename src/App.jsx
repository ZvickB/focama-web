import { Suspense, lazy, useEffect } from 'react'
import { Route, Routes } from 'react-router-dom'
import { Analytics } from '@vercel/analytics/react'
import { SpeedInsights } from '@vercel/speed-insights/react'
import SiteLayout from '@/components/SiteLayout.jsx'
import { AmazonStoreProvider } from '@/contexts/AmazonStoreContext.jsx'
import { SearchProgressProvider } from '@/contexts/SearchProgressContext.jsx'

const HomePage = lazy(() => import('@/pages/HomePage.jsx'))
const AboutPage = lazy(() => import('@/pages/AboutPage.jsx'))
const AffiliateDisclosurePage = lazy(() => import('@/pages/AffiliateDisclosurePage.jsx'))
const ContactPage = lazy(() => import('@/pages/ContactPage.jsx'))
const NotFoundPage = lazy(() => import('@/pages/NotFoundPage.jsx'))
const PrivacyPage = lazy(() => import('@/pages/PrivacyPage.jsx'))
const WhyFocamaiPage = lazy(() => import('@/pages/WhyFocamaiPage.jsx'))
const AnalyticsPage = import.meta.env.DEV
  ? lazy(() => import('@/pages/AnalyticsPage.jsx'))
  : null

const SPLASH_MIN_DURATION_MS = 800
const SPLASH_HIDE_DURATION_MS = 440

function AppRoutes({ onReady }) {
  useEffect(() => {
    return onReady()
  }, [onReady])

  return (
    <Routes>
      <Route element={<SiteLayout />}>
        <Route path="/" element={<HomePage />} />
        <Route path="/about" element={<AboutPage />} />
        {import.meta.env.DEV && AnalyticsPage ? (
          <Route path="/admin/analytics" element={<AnalyticsPage />} />
        ) : null}
        <Route path="/why" element={<WhyFocamaiPage />} />
        <Route path="/contact" element={<ContactPage />} />
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
        <Suspense fallback={null}>
          <AppRoutes onReady={handleRoutesReady} />
        </Suspense>
        <Analytics />
        <SpeedInsights />
      </SearchProgressProvider>
    </AmazonStoreProvider>
  )
}

export default App
