import { Suspense, lazy } from 'react'
import { Route, Routes } from 'react-router-dom'
import SiteLayout from '@/components/SiteLayout.jsx'

const HomePage = lazy(() => import('@/pages/HomePage.jsx'))
const HomePageHero = lazy(() => import('@/pages/HomePageHero.jsx'))
const HomePageFlow = lazy(() => import('@/pages/HomePageFlow.jsx'))
const HomePageConcierge = lazy(() => import('@/pages/HomePageConcierge.jsx'))
const HomePageInstant = lazy(() => import('@/pages/HomePageInstant.jsx'))
const HomePageOpen = lazy(() => import('@/pages/HomePageOpen.jsx'))
const AboutPage = lazy(() => import('@/pages/AboutPage.jsx'))
const AffiliateDisclosurePage = lazy(() => import('@/pages/AffiliateDisclosurePage.jsx'))
const ContactPage = lazy(() => import('@/pages/ContactPage.jsx'))
const NotFoundPage = lazy(() => import('@/pages/NotFoundPage.jsx'))
const PrivacyPage = lazy(() => import('@/pages/PrivacyPage.jsx'))

function RouteFallback() {
  return (
    <main className="px-4 py-16 sm:px-6 lg:px-8">
      <div className="mx-auto flex max-w-5xl flex-col items-center gap-8">
        <div className="space-y-3 text-center">
          <p className="text-4xl font-semibold tracking-tight text-slate-950 sm:text-5xl">Focama</p>
          <p className="text-sm text-slate-500">Focused shopping</p>
        </div>
        <div className="w-full max-w-3xl rounded-[36px] border border-white/70 bg-white/72 p-4 shadow-[0_30px_120px_-60px_rgba(15,23,42,0.28)] backdrop-blur sm:p-5">
          <div className="h-16 rounded-[28px] bg-stone-100/90" />
        </div>
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
          <Route path="/ui/open" element={<HomePageOpen />} />
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
