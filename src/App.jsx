import { Suspense, lazy, useEffect } from 'react'
import { Route, Routes } from 'react-router-dom'
import SiteLayout from '@/components/SiteLayout.jsx'

const HomePage = lazy(() => import('@/pages/HomePage.jsx'))
const AboutPage = lazy(() => import('@/pages/AboutPage.jsx'))
const AffiliateDisclosurePage = lazy(() => import('@/pages/AffiliateDisclosurePage.jsx'))
const ContactPage = lazy(() => import('@/pages/ContactPage.jsx'))
const NotFoundPage = lazy(() => import('@/pages/NotFoundPage.jsx'))
const PrivacyPage = lazy(() => import('@/pages/PrivacyPage.jsx'))

const SPLASH_MIN_DURATION_MS = 800
const SPLASH_HIDE_DURATION_MS = 340

function AppRoutes({ onReady }) {
  useEffect(() => {
    return onReady()
  }, [onReady])

  return (
    <Routes>
      <Route element={<SiteLayout />}>
        <Route path="/" element={<HomePage />} />
        <Route path="/about" element={<AboutPage />} />
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
    <Suspense fallback={null}>
      <AppRoutes onReady={handleRoutesReady} />
    </Suspense>
  )
}

export default App
