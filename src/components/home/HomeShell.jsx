import { useEffect, useRef, useState } from 'react'
import { LoaderCircle, Search } from 'lucide-react'
import { MAX_PRODUCT_QUERY_LENGTH } from '../../../shared/search-input.js'
import { validateSearchInput } from '../../../shared/search-input.js'

import wordmark from '@/assets/wordmark.PNG'
import { Button } from '@/components/ui/button.jsx'
import { Label } from '@/components/ui/label.jsx'
import { Textarea } from '@/components/ui/textarea.jsx'

const HERO_SUBLINE = "Tell us what you need. We'll find your six."

function applyPlainBackgroundMode() {
  if (typeof document === 'undefined') {
    return
  }

  document.documentElement.dataset.bgMode = 'plain'
}

function CharCounter({ current, max }) {
  if (current === 0) return null
  const remaining = max - current
  const pct = current / max
  return (
    <span className={`text-xs transition-colors ${
      pct >= 0.95 ? 'text-red-500' : pct >= 0.8 ? 'text-amber-500' : 'text-slate-400'
    }`}>
      {remaining} characters left
    </span>
  )
}

function shouldShowCharCounter(current, max) {
  return current > 0 && max - current <= 20
}

function handleProductQueryTextareaKeyDown(event, { canSubmit, onSubmit }) {
  if (event.key !== 'Enter' || event.shiftKey || event.nativeEvent?.isComposing) {
    return
  }

  event.preventDefault()

  if (canSubmit) {
    onSubmit(event)
  }
}

function isLikelyDesktop() {
  return typeof window !== 'undefined' && !('ontouchstart' in window)
}

export function HomeShell({
  initialQuery = '',
  isStarting = false,
  onSearchStart,
}) {
  const searchInputRef = useRef(null)
  const [productQuery, setProductQuery] = useState(initialQuery)
  const [errorMessage, setErrorMessage] = useState('')
  const [showHeroCopy, setShowHeroCopy] = useState(false)

  useEffect(() => {
    applyPlainBackgroundMode()
  }, [])

  useEffect(() => {
    setProductQuery(initialQuery)
  }, [initialQuery])

  useEffect(() => {
    const revealTimer = window.setTimeout(() => {
      setShowHeroCopy(true)
    }, 360)

    return () => {
      window.clearTimeout(revealTimer)
    }
  }, [])

  function handleSearchSubmit(event) {
    event.preventDefault()
    const { error, isValid, normalizedQuery } = validateSearchInput(productQuery, '')

    if (!isValid) {
      setErrorMessage(error)
      return
    }

    setErrorMessage('')
    onSearchStart?.(normalizedQuery)
  }

  return (
    <main className="px-3 pt-4 pb-6 sm:px-6 sm:pt-5 sm:pb-8 lg:px-6 xl:px-8">
      <div className="mx-auto flex max-w-7xl flex-col items-center gap-8">
        <section className="relative w-full max-w-4xl overflow-hidden rounded-[36px] px-2 py-3 text-center sm:px-4 sm:py-5">
          <div
            aria-hidden="true"
            className="pointer-events-none absolute inset-x-0 top-0 h-[78%] opacity-90"
            style={{
              background:
                'radial-gradient(circle at 20% 22%, rgba(229,155,38,0.11), transparent 26%), radial-gradient(circle at 78% 18%, rgba(15,97,117,0.09), transparent 24%), radial-gradient(circle at 50% 0%, rgba(255,255,255,0.9), transparent 56%)',
            }}
          />
          <div className="relative space-y-6">
            <div className="space-y-4">
              <div className="space-y-2">
                <img
                  src={wordmark}
                  alt="Focamai"
                  className="mx-auto h-auto w-full max-w-[240px] sm:max-w-[340px] lg:max-w-[420px]"
                />
              </div>
              <div className="space-y-3">
                <h2
                  className={`text-2xl font-medium tracking-tight text-[#155f70] transition-opacity duration-300 sm:text-4xl ${
                    showHeroCopy ? 'opacity-100' : 'opacity-0'
                  }`}
                >
                  What are you looking for today?
                </h2>
                <p
                  className={`mx-auto max-w-xl text-[13px] italic font-medium tracking-[0.01em] text-slate-500 transition-opacity duration-300 sm:text-[15px] ${
                    showHeroCopy ? 'opacity-100' : 'opacity-0'
                  }`}
                  style={{ fontFamily: '"Instrument Sans", sans-serif' }}
                >
                  {HERO_SUBLINE}
                </p>
                <div
                  className="text-[13px] font-semibold uppercase tracking-[0.14em] sm:text-sm"
                  style={{ fontFamily: '"Instrument Sans", sans-serif' }}
                >
                  <span className="text-primary">Search</span>
                  <span className="px-2 text-slate-300">·</span>
                  <span className="text-slate-400">Refine</span>
                  <span className="px-2 text-slate-300">·</span>
                  <span className="text-slate-400">Get 6 picks</span>
                </div>
              </div>
            </div>

            <form className="flex justify-center" onSubmit={handleSearchSubmit}>
              <div className="w-full max-w-3xl">
                <div className="scroll-mt-28 rounded-[36px] border border-[#e4d7c6] bg-[linear-gradient(180deg,rgba(255,255,255,0.98),rgba(250,246,241,0.94))] p-4 text-left shadow-[0_28px_120px_-72px_rgba(15,23,42,0.45)] backdrop-blur transition-all duration-300 sm:p-5">
                  <div className="flex flex-col gap-3 md:flex-row md:items-center">
                    <div className="flex-1">
                      <Label htmlFor="open-variant-query" className="sr-only">
                        Product topic
                      </Label>
                      <Textarea
                        ref={searchInputRef}
                        id="open-variant-query"
                        aria-label="Product topic"
                        value={productQuery}
                        rows={2}
                        maxLength={MAX_PRODUCT_QUERY_LENGTH}
                        onChange={(event) => setProductQuery(event.target.value)}
                        onKeyDown={(event) =>
                          handleProductQueryTextareaKeyDown(event, {
                            canSubmit: !isStarting,
                            onSubmit: handleSearchSubmit,
                          })
                        }
                        placeholder='Try "travel stroller for airplane", "ergonomic office chair", or "lego botanical set"'
                        className="min-h-[5.25rem] w-full resize-none rounded-[28px] border border-[#e5dacb] bg-white px-5 py-4 text-lg leading-7 text-slate-900 outline-none transition placeholder:text-[15px] placeholder:text-slate-400 focus-visible:border-primary/50 focus-visible:ring-[4px] focus-visible:ring-[rgba(15,97,117,0.08)] sm:placeholder:text-base"
                        autoFocus={isLikelyDesktop()}
                        disabled={isStarting}
                      />
                      {errorMessage ? (
                        <p className="mt-2 px-2 text-sm text-red-500">{errorMessage}</p>
                      ) : null}
                      {shouldShowCharCounter(productQuery.length, MAX_PRODUCT_QUERY_LENGTH) ? (
                        <div className="mt-1.5 flex justify-end px-2">
                          <CharCounter current={productQuery.length} max={MAX_PRODUCT_QUERY_LENGTH} />
                        </div>
                      ) : null}
                    </div>
                    <Button
                      type="submit"
                      disabled={isStarting}
                      className="h-16 rounded-[28px] bg-primary px-6 text-base text-primary-foreground shadow-[0_22px_48px_-28px_rgba(15,97,117,0.38)] transition-transform hover:-translate-y-[1px] hover:bg-primary/90"
                    >
                      {isStarting ? 'Starting your search...' : 'Start search'}
                      {isStarting ? (
                        <LoaderCircle className="ml-2 h-4 w-4 animate-spin" />
                      ) : (
                        <Search className="ml-2 h-4 w-4" />
                      )}
                    </Button>
                  </div>
                  <p className="mt-3 px-2 text-sm leading-6 text-slate-500">
                    Just the product for now — budget, size, and other details come next.
                  </p>
                </div>
              </div>
            </form>
          </div>
        </section>
      </div>
    </main>
  )
}
