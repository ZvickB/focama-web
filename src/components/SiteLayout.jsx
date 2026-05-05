import { useEffect, useState } from 'react'
import { Menu, X } from 'lucide-react'
import { NavLink, Outlet, useLocation } from 'react-router-dom'
import logo from '@/assets/logo_header_mark.svg'
import wordmark from '@/assets/wordmark.PNG'
import { AmazonStorePill } from '@/components/AmazonStorePill.jsx'
import { useSearchProgress } from '@/contexts/useSearchProgress.js'

const navItems = [
  { to: '/', label: 'Home', end: true },
  { to: '/why', label: 'Why Focamai', highlight: true },
  { to: '/contact', label: 'Contact' },
]

const mobileMenuItems = navItems.filter((item) =>
  ['/', '/why', '/contact'].includes(item.to),
)
const HEADER_COLLAPSE_SCROLL_Y = 72
const HEADER_EXPAND_SCROLL_Y = 20

function SlidingNav({ items, className = '' }) {
  return (
    <nav className={`relative flex flex-wrap items-center gap-1.5 rounded-full ${className}`}>
      {items.map((item) => (
        <NavLink
          key={item.to}
          to={item.to}
          end={item.end}
          className={({ isActive }) =>
            [
              'group relative rounded-full px-4 py-2.5 text-sm transition-colors duration-300',
              isActive
                ? 'text-slate-900'
                : item.highlight
                  ? 'text-slate-700 hover:text-slate-900'
                  : 'text-slate-600 hover:text-slate-900',
            ].join(' ')
          }
        >
          {({ isActive }) => (
            <>
              <span className="relative z-10">
                {item.highlight ? (
                  <>
                    <span
                      className={`font-semibold transition-colors duration-300 ${
                        isActive ? 'text-slate-900' : ''
                      }`}
                      style={isActive ? undefined : { color: '#0F6175' }}
                    >
                      Why Focama
                    </span>
                    <span
                      className={`font-semibold italic transition-colors duration-300 ${
                        isActive ? 'text-slate-900' : ''
                      }`}
                      style={isActive ? undefined : { color: '#E59B26' }}
                    >
                      i
                    </span>
                  </>
                ) : (
                  item.label
                )}
              </span>
              <span
                aria-hidden="true"
                className={`pointer-events-none absolute bottom-[5px] left-1/2 h-[2px] -translate-x-1/2 rounded-full bg-[linear-gradient(90deg,#0F6175_0%,#2F7F8A_58%,#E59B26_100%)] shadow-[0_6px_18px_-12px_rgba(15,97,117,0.8)] transition-all duration-300 ease-out ${
                  isActive ? 'w-[calc(100%-1.5rem)] scale-x-100 opacity-100' : 'w-[calc(100%-1.5rem)] scale-x-0 opacity-0 group-hover:scale-x-100 group-hover:opacity-70'
                }`}
              />
            </>
          )}
        </NavLink>
      ))}
    </nav>
  )
}

function SearchStepIndicator({ progress }) {
  const { hasStartedSearch, hasDiscoveryResults, hasFinalResults } = progress
  if (!hasStartedSearch) return null

  return (
    <div
      className="text-[11px] font-semibold uppercase tracking-[0.14em] sm:text-[13px]"
      style={{ fontFamily: '"Instrument Sans", sans-serif' }}
    >
      <span className={hasDiscoveryResults ? 'text-slate-400' : 'text-primary'}>Search</span>
      <span className="px-1.5 text-slate-300">·</span>
      <span
        className={
          hasDiscoveryResults && !hasFinalResults ? 'text-primary' : 'text-slate-400'
        }
      >
        Refine
      </span>
      <span className="px-1.5 text-slate-300">·</span>
      <span className={hasFinalResults ? 'text-primary' : 'text-slate-400'}>Get 6 picks</span>
    </div>
  )
}

function SiteLayout() {
  const [isCompact, setIsCompact] = useState(false)
  const [mobileMenuOpenPath, setMobileMenuOpenPath] = useState(null)
  const location = useLocation()
  const isMobileMenuOpen = mobileMenuOpenPath === location.pathname
  const isHomePage = location.pathname === '/'
  const { progress } = useSearchProgress()

  useEffect(() => {
    function handleScroll() {
      const nextScrollY = window.scrollY

      setIsCompact((currentValue) => {
        if (currentValue) {
          return nextScrollY > HEADER_EXPAND_SCROLL_Y
        }

        return nextScrollY > HEADER_COLLAPSE_SCROLL_Y
      })
    }

    handleScroll()
    window.addEventListener('scroll', handleScroll, { passive: true })

    return () => {
      window.removeEventListener('scroll', handleScroll)
    }
  }, [])

  return (
    <div className="min-h-screen">
      <header className="sticky top-0 z-50 border-b border-[var(--site-shell-border)] bg-[var(--site-header-bg)] backdrop-blur transition-all duration-300 ease-out">
        <div
          className={`mx-auto flex w-full max-w-7xl flex-col gap-4 px-4 transition-all duration-300 ease-out sm:px-6 lg:flex-row lg:items-center lg:justify-between lg:px-8 ${
            isCompact ? 'py-2.5' : 'py-4'
          }`}
        >
          <div className="flex w-full items-start justify-between gap-4 lg:w-auto">
            <div className="space-y-1">
              <NavLink to="/" className="flex items-center gap-3 text-slate-900">
                <img
                  src={logo}
                  alt="Focamai logo"
                  width="96"
                  height="96"
                  className={`rounded-[18px] bg-white/35 object-contain p-0.5 shadow-[0_8px_24px_-18px_rgba(15,23,42,0.28)] ring-1 ring-stone-200/35 transition-all duration-300 ease-out ${
                    isCompact ? 'h-12 w-12 sm:h-14 sm:w-14' : 'h-16 w-16 sm:h-20 sm:w-20'
                  }`}
                />
                <img
                  src={wordmark}
                  alt="Focamai"
                  className={`h-7 w-auto object-contain transition-all duration-300 ease-out ${isCompact ? 'opacity-100' : 'opacity-0 pointer-events-none'}`}
                />
              </NavLink>
              <p
                className={`text-sm text-slate-500 transition-all duration-300 ease-out ${
                  isCompact
                    ? 'max-h-0 translate-y-[-4px] overflow-hidden opacity-0'
                    : 'max-h-10 translate-y-0 opacity-100'
                }`}
              >
                Calm buying guidance before the marketplace.
              </p>
            </div>
            <button
              type="button"
              aria-expanded={isMobileMenuOpen}
              aria-label="Toggle navigation menu"
              onClick={() =>
                setMobileMenuOpenPath((openPath) =>
                  openPath === location.pathname ? null : location.pathname,
                )
              }
              className="mt-1 inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-full border border-white/80 bg-white/80 text-slate-700 shadow-[0_12px_30px_-18px_rgba(15,23,42,0.35)] transition hover:text-slate-900 sm:hidden"
            >
              {isMobileMenuOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
            </button>
          </div>
          <div className="hidden flex-1 items-center justify-center lg:flex">
            <SearchStepIndicator progress={progress} />
          </div>
          <div className="hidden sm:flex sm:items-center sm:gap-3">
            {isHomePage ? <AmazonStorePill variant="header" /> : null}
            <SlidingNav items={navItems} />
          </div>
        </div>
        <div
          className={`overflow-hidden border-t border-[var(--site-shell-border)] bg-[var(--site-mobile-menu-bg)] transition-all duration-300 ease-out sm:hidden ${
            isMobileMenuOpen ? 'max-h-40 opacity-100' : 'max-h-0 opacity-0'
          }`}
        >
          <div className="mx-auto flex w-full max-w-7xl flex-col gap-2 px-4 py-3">
            {mobileMenuItems.map((item) => (
              <NavLink
                key={item.to}
                to={item.to}
                className={({ isActive }) =>
                  [
                    'rounded-2xl px-4 py-3 text-sm transition',
                    isActive
                      ? 'bg-primary text-primary-foreground'
                      : 'bg-white/80 text-slate-700 hover:bg-white hover:text-slate-900',
                  ].join(' ')
                }
              >
                {item.label}
              </NavLink>
            ))}
            {isHomePage ? (
              <div className="flex items-center gap-2 px-1 pt-1 text-xs text-slate-400">
                <span>Amazon store:</span>
                <AmazonStorePill variant="header" />
              </div>
            ) : null}
          </div>
        </div>
      </header>

      <div className="pb-6 pt-2 sm:pb-8">
        <Outlet />
      </div>

      <footer className="border-t border-[var(--site-shell-border)] bg-[var(--site-footer-bg)] px-4 py-8 sm:px-6 lg:px-8">
        <div className="mx-auto grid w-full max-w-7xl gap-6 text-sm text-slate-600 lg:grid-cols-[1.2fr_0.8fr]">
          <div className="space-y-2">
            <p className="text-base font-semibold text-slate-900">Focamai</p>
            <p>
              Focamai offers calm buying guidance before you head to a marketplace. The current app
              focuses on guided product search, AI-assisted shortlist refinement, and clear trust
              pages while the broader product continues to evolve.
            </p>
            <p className="text-xs text-slate-400">
              As an Amazon Associate I earn from qualifying purchases.{' '}
              <NavLink to="/affiliate-disclosure" className="underline underline-offset-2 hover:text-slate-600">
                Affiliate disclosure
              </NavLink>
            </p>
          </div>
          <div className="space-y-3">
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">
              Site Links
            </p>
            <div className="flex flex-wrap gap-3">
              {navItems
                .filter((item) => item.to !== '/')
                .map((item) => (
                  <NavLink key={item.to} to={item.to} className="hover:text-slate-900">
                    {item.label}
                  </NavLink>
                ))}
              <NavLink to="/privacy" className="hover:text-slate-900">Privacy</NavLink>
              <NavLink to="/affiliate-disclosure" className="hover:text-slate-900">Affiliate Disclosure</NavLink>
            </div>
          </div>
        </div>
      </footer>
    </div>
  )
}

export default SiteLayout
