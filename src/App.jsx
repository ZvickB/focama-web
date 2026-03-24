import { Suspense, lazy, useEffect, useState } from 'react'
import logo from '@/assets/logo_header_mark.svg'
import { Route, Routes } from 'react-router-dom'
import SiteLayout from '@/components/SiteLayout.jsx'
import wordmark from '@/assets/wordmark.PNG'

const HomePage = lazy(() => import('@/pages/HomePage.jsx'))
const AboutPage = lazy(() => import('@/pages/AboutPage.jsx'))
const AffiliateDisclosurePage = lazy(() => import('@/pages/AffiliateDisclosurePage.jsx'))
const ContactPage = lazy(() => import('@/pages/ContactPage.jsx'))
const NotFoundPage = lazy(() => import('@/pages/NotFoundPage.jsx'))
const PrivacyPage = lazy(() => import('@/pages/PrivacyPage.jsx'))

const SPLASH_TEXT = 'Focused shopping'
const SPLASH_MIN_DURATION_MS = 1900
const SPLASH_WORDMARK_LEAD_MS = 420
const SPLASH_TYPEWRITER_STEP_MS = 55
const SPLASH_HIDE_DURATION_MS = 320

function SplashScreen({ typedText = '', isVisible = true }) {
  return (
    <main
      className={`min-h-screen transition-opacity duration-300 ${
        isVisible ? 'opacity-100' : 'opacity-0'
      }`}
    >
      <header className="sticky top-0 z-50 border-b border-white/60 bg-[rgba(252,249,243,0.88)] backdrop-blur">
        <div className="mx-auto flex w-full max-w-7xl flex-col gap-4 px-4 py-4 sm:px-6 lg:flex-row lg:items-center lg:justify-between lg:px-8">
          <div className="flex w-full items-start justify-between gap-4 lg:w-auto">
            <div className="space-y-1">
              <div className="flex items-center gap-3 text-slate-900">
                <img
                  src={logo}
                  alt=""
                  aria-hidden="true"
                  width="96"
                  height="96"
                  className="h-16 w-16 rounded-[18px] bg-white/35 object-contain p-0.5 shadow-[0_8px_24px_-18px_rgba(15,23,42,0.28)] ring-1 ring-stone-200/35 sm:h-20 sm:w-20"
                />
                <span className="text-lg font-semibold tracking-[0.08em] sm:text-xl">FOCAMA</span>
              </div>
              <p className="text-sm text-slate-500">Calm buying guidance before the marketplace.</p>
            </div>
            <div className="mt-1 inline-flex h-11 w-11 shrink-0 rounded-full border border-white/80 bg-white/80 shadow-[0_12px_30px_-18px_rgba(15,23,42,0.35)] sm:hidden" />
          </div>
          <div className="hidden sm:block">
            <div className="flex flex-wrap items-center gap-2 rounded-full">
              {['Home', 'About', 'Contact', 'Privacy', 'Disclosure'].map((item, index) => (
                <span
                  key={item}
                  className={`rounded-full px-4 py-2 text-sm ${
                    index === 0
                      ? 'border border-primary bg-primary text-primary-foreground shadow-[0_12px_30px_-18px_rgba(15,23,42,0.55)]'
                      : 'text-slate-600'
                  }`}
                >
                  {item}
                </span>
              ))}
            </div>
          </div>
        </div>
      </header>

      <div className="px-3 pb-6 pt-2 sm:px-6 sm:pb-8 lg:px-8">
        <div className="mx-auto flex max-w-7xl flex-col items-center gap-8">
        <section className="w-full max-w-4xl space-y-6 text-center">
          <div className="space-y-4">
            <div className="space-y-2">
              <img
                src={wordmark}
                alt="Focama"
                className="mx-auto h-auto w-full max-w-[240px] sm:max-w-[340px] lg:max-w-[420px]"
              />
            </div>
            <div className="space-y-3">
              <h2 className="min-h-[2rem] text-2xl font-medium tracking-tight text-slate-900 sm:min-h-[3rem] sm:text-4xl">
                <span
                  className={`inline-flex items-center justify-center transition-opacity duration-500 ${
                    typedText ? 'opacity-100' : 'opacity-0'
                  }`}
                >
                  <span>{typedText}</span>
                </span>
              </h2>
            </div>
          </div>
        </section>
        <div className="w-full max-w-3xl rounded-[36px] border border-white/70 bg-white/72 p-4 shadow-[0_30px_120px_-60px_rgba(15,23,42,0.28)] backdrop-blur sm:p-5">
          <div className="h-16 rounded-[28px] bg-stone-100/90" />
        </div>
      </div>
      </div>
    </main>
  )
}

function AppRoutes({ onReady }) {
  useEffect(() => {
    onReady()
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
  const [typedText, setTypedText] = useState('')
  const [hasMetMinimumDelay, setHasMetMinimumDelay] = useState(false)
  const [routesReady, setRoutesReady] = useState(false)
  const [showSplash, setShowSplash] = useState(true)
  const [isSplashVisible, setIsSplashVisible] = useState(true)

  useEffect(() => {
    const minimumDelayTimer = window.setTimeout(() => {
      setHasMetMinimumDelay(true)
    }, SPLASH_MIN_DURATION_MS)

    return () => {
      window.clearTimeout(minimumDelayTimer)
    }
  }, [])

  useEffect(() => {
    let nextIndex = 0
    let typewriterTimer = null

    const startTypingTimer = window.setTimeout(() => {
      typewriterTimer = window.setInterval(() => {
        nextIndex += 1
        setTypedText(SPLASH_TEXT.slice(0, nextIndex))

        if (nextIndex >= SPLASH_TEXT.length) {
          window.clearInterval(typewriterTimer)
        }
      }, SPLASH_TYPEWRITER_STEP_MS)
    }, SPLASH_WORDMARK_LEAD_MS)

    return () => {
      window.clearTimeout(startTypingTimer)
      if (typewriterTimer) {
        window.clearInterval(typewriterTimer)
      }
    }
  }, [])

  useEffect(() => {
    if (!hasMetMinimumDelay || !routesReady || !showSplash) {
      return
    }

    const fadeFrame = window.requestAnimationFrame(() => {
      setIsSplashVisible(false)
    })

    const hideTimer = window.setTimeout(() => {
      setShowSplash(false)
    }, SPLASH_HIDE_DURATION_MS)

    return () => {
      window.cancelAnimationFrame(fadeFrame)
      window.clearTimeout(hideTimer)
    }
  }, [hasMetMinimumDelay, routesReady, showSplash])

  return (
    <>
      <Suspense fallback={<SplashScreen typedText={typedText} isVisible={true} />}>
        <AppRoutes onReady={() => setRoutesReady(true)} />
      </Suspense>
      {showSplash ? (
        <div className="pointer-events-none fixed inset-0 z-[100] bg-background">
          <SplashScreen typedText={typedText} isVisible={isSplashVisible} />
        </div>
      ) : null}
    </>
  )
}

export default App
