import { useEffect, useRef, useState } from 'react'
import { Menu, X } from 'lucide-react'
import { NavLink, Outlet, useLocation } from 'react-router-dom'
import logo from '@/assets/logo_header_mark.svg'

const navItems = [
  { to: '/', label: 'Home', end: true },
  { to: '/about', label: 'About' },
  { to: '/contact', label: 'Contact' },
  { to: '/privacy', label: 'Privacy' },
  { to: '/affiliate-disclosure', label: 'Disclosure' },
]

const mobileMenuItems = navItems.filter((item) =>
  ['/', '/about', '/contact'].includes(item.to),
)
const HEADER_COLLAPSE_SCROLL_Y = 72
const HEADER_EXPAND_SCROLL_Y = 20

function SlidingNav({ items, className = '' }) {
  const location = useLocation()
  const navRef = useRef(null)
  const itemRefs = useRef({})
  const [highlightStyle, setHighlightStyle] = useState(null)

  useEffect(() => {
    function updateHighlight() {
      const activeItem = items.find((item) =>
        item.end ? location.pathname === item.to : location.pathname.startsWith(item.to),
      )

      if (!activeItem) {
        setHighlightStyle(null)
        return
      }

      const navElement = navRef.current
      const activeElement = itemRefs.current[activeItem.to]

      if (!navElement || !activeElement) {
        return
      }

      setHighlightStyle({
        width: activeElement.offsetWidth,
        height: activeElement.offsetHeight,
        transform: `translate(${activeElement.offsetLeft}px, ${activeElement.offsetTop}px)`,
      })
    }

    updateHighlight()
    window.addEventListener('resize', updateHighlight)

    return () => {
      window.removeEventListener('resize', updateHighlight)
    }
  }, [items, location.pathname])

  return (
    <nav ref={navRef} className={`relative flex flex-wrap items-center gap-2 rounded-full ${className}`}>
      <span
        aria-hidden="true"
        className={`pointer-events-none absolute left-0 top-0 rounded-full border border-primary bg-primary shadow-[0_12px_30px_-18px_rgba(15,23,42,0.55)] transition-all duration-300 ease-out ${
          highlightStyle ? 'opacity-100' : 'opacity-0'
        }`}
        style={highlightStyle ?? undefined}
      />
      {items.map((item) => (
        <NavLink
          key={item.to}
          to={item.to}
          end={item.end}
          ref={(node) => {
            itemRefs.current[item.to] = node
          }}
          className={({ isActive }) =>
            [
              'relative z-10 rounded-full border border-transparent px-4 py-2 text-sm transition-colors duration-300',
              isActive
                ? 'text-primary-foreground'
                : 'text-slate-600 hover:border-white/80 hover:bg-white/80 hover:text-slate-900',
            ].join(' ')
          }
        >
          {item.label}
        </NavLink>
      ))}
    </nav>
  )
}

function SiteLayout() {
  const [isCompact, setIsCompact] = useState(false)
  const [mobileMenuOpenPath, setMobileMenuOpenPath] = useState(null)
  const location = useLocation()
  const isMobileMenuOpen = mobileMenuOpenPath === location.pathname

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
      <header className="sticky top-0 z-50 border-b border-white/60 bg-[rgba(252,249,243,0.88)] backdrop-blur transition-all duration-300 ease-out">
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
                <span className="text-lg font-semibold tracking-[0.08em] sm:text-xl">FOCAMAI</span>
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
          <div className="hidden sm:block">
            <SlidingNav items={navItems} />
          </div>
        </div>
        <div
          className={`overflow-hidden border-t border-white/60 bg-[rgba(252,249,243,0.94)] transition-all duration-300 ease-out sm:hidden ${
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
          </div>
        </div>
      </header>

      <div className="pb-6 pt-2 sm:pb-8">
        <Outlet />
      </div>

      <footer className="border-t border-white/60 bg-[rgba(252,249,243,0.72)] px-4 py-8 sm:px-6 lg:px-8">
        <div className="mx-auto grid w-full max-w-7xl gap-6 text-sm text-slate-600 lg:grid-cols-[1.2fr_0.8fr]">
          <div className="space-y-2">
            <p className="text-base font-semibold text-slate-900">Focamai</p>
            <p>
              Focamai offers calm buying guidance before you head to a marketplace. The current app
              focuses on guided product search, AI-assisted shortlist refinement, and clear trust
              pages while the broader product continues to evolve.
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
            </div>
          </div>
        </div>
      </footer>
    </div>
  )
}

export default SiteLayout
