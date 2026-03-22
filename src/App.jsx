import { Suspense, lazy } from 'react'
import { Route, Routes } from 'react-router-dom'
import SiteLayout from '@/components/SiteLayout.jsx'

const HomePage = lazy(() => import('@/pages/HomePage.jsx'))
const HomePageHero = lazy(() => import('@/pages/HomePageHero.jsx'))
const HomePageFlow = lazy(() => import('@/pages/HomePageFlow.jsx'))
const HomePageConcierge = lazy(() => import('@/pages/HomePageConcierge.jsx'))
const HomePageInstant = lazy(() => import('@/pages/HomePageInstant.jsx'))
const AboutPage = lazy(() => import('@/pages/AboutPage.jsx'))
const AffiliateDisclosurePage = lazy(() => import('@/pages/AffiliateDisclosurePage.jsx'))
const ContactPage = lazy(() => import('@/pages/ContactPage.jsx'))
const NotFoundPage = lazy(() => import('@/pages/NotFoundPage.jsx'))
const PrivacyPage = lazy(() => import('@/pages/PrivacyPage.jsx'))

function RouteFallback() {
  return (
    <main className="px-4 py-16 sm:px-6 lg:px-8">
      <div className="mx-auto max-w-7xl rounded-[28px] border border-white/70 bg-white/72 p-6 text-sm text-slate-600 shadow-[0_30px_120px_-60px_rgba(15,23,42,0.35)] backdrop-blur sm:rounded-[32px]">
        Loading page...
      </div>
    </main>
  )
}

function App() {
  return (
    <Suspense fallback={<RouteFallback />}>
      <Routes>
        <Route element={<SiteLayout />}>
          <Route path="/" element={<HomePage />} />
          <Route path="/ui/hero" element={<HomePageHero />} />
          <Route path="/ui/flow" element={<HomePageFlow />} />
          <Route path="/ui/concierge" element={<HomePageConcierge />} />
          <Route path="/ui/instant" element={<HomePageInstant />} />
          <Route path="/about" element={<AboutPage />} />
          <Route path="/contact" element={<ContactPage />} />
          <Route path="/privacy" element={<PrivacyPage />} />
          <Route path="/affiliate-disclosure" element={<AffiliateDisclosurePage />} />
          <Route path="*" element={<NotFoundPage />} />
        </Route>
      </Routes>
    </Suspense>
  )
}

export default App
