import { useEffect, useRef } from 'react'
import { Check, ChevronRight } from 'lucide-react'

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card.jsx'
import { ProductDetailModal, RefinementCard, ResultsSection, ResultSkeleton, SearchForm } from '@/components/home/HomeShared.jsx'
import { RESULT_CARD_SLOTS, useGuidedSearch } from '@/components/home/useGuidedSearch.js'

function VariantPicker() {
  const variants = [
    { href: '/', label: 'Current split' },
    { href: '/ui/hero', label: 'Strong hero' },
    { href: '/ui/flow', label: 'Flowing' },
    { href: '/ui/concierge', label: 'Concierge' },
    { href: '/ui/instant', label: 'Instant results' },
  ]

  return (
    <div className="flex flex-wrap gap-2">
      {variants.map((variant) => (
        <a
          key={variant.href}
          href={variant.href}
          className="inline-flex items-center gap-2 rounded-full border border-white/75 bg-white/72 px-3 py-2 text-sm text-slate-700 transition hover:bg-white"
        >
          {variant.label}
          <ChevronRight className="h-4 w-4 text-slate-400" />
        </a>
      ))}
    </div>
  )
}

function CurrentLayout(props) {
  const {
    displayedResults,
    errorMessage,
    hasFinalResults,
    hasStartedSearch,
    isLoading,
    onFinalize,
    onSelectProduct,
    onShowProductsNow,
    prompt,
    selectionMeta,
    selectedPriorities,
    setFollowUpNotes,
    setProductQuery,
    showPreviewResults,
    state,
    submittedQuery,
    togglePriority,
  } = props

  return (
    <main className="relative px-3 py-4 sm:px-6 sm:py-6 lg:px-8">
      <div className="mx-auto grid w-full max-w-7xl gap-4 sm:gap-6 xl:grid-cols-[minmax(360px,460px),minmax(0,1fr)] xl:items-start">
        <section className="rounded-[28px] border border-white/70 bg-white/72 p-4 shadow-[0_30px_120px_-60px_rgba(15,23,42,0.35)] backdrop-blur sm:rounded-[32px] sm:p-5 lg:p-8">
          <Card className="rounded-[28px] border-stone-200/80 bg-[#f8f3eb] shadow-none sm:rounded-[32px]">
            <CardHeader className="space-y-3">
              <CardTitle className="text-2xl text-slate-900">Start product search</CardTitle>
            </CardHeader>
            <CardContent className="space-y-5">
              <SearchForm
                helperText="Enter one product topic, then refine the shortlist while Focama gathers the options."
                heroTitle="Search smarter without opening twenty tabs."
                isLoading={isLoading}
                onSubmit={state.beginGuidedSearch}
                productQuery={state.productQuery}
                setProductQuery={setProductQuery}
                showTrustRow={false}
                suggestions={['office chair', 'lego set', 'travel stroller']}
              />

              {hasStartedSearch ? (
                <RefinementCard
                  candidatePool={state.candidatePool}
                  followUpNotes={state.followUpNotes}
                  isFinalizing={state.isFinalizing}
                  onFinalize={onFinalize}
                  onShowNow={onShowProductsNow}
                  prompt={prompt}
                  selectedPriorities={selectedPriorities}
                  setFollowUpNotes={setFollowUpNotes}
                  togglePriority={togglePriority}
                />
              ) : null}
            </CardContent>
          </Card>
        </section>

        <section className="xl:sticky xl:top-6">
          <Card className="rounded-[28px] border-white/70 bg-white/72 shadow-[0_30px_120px_-60px_rgba(15,23,42,0.35)] backdrop-blur sm:rounded-[32px] xl:flex xl:max-h-[calc(100vh-7rem)] xl:min-h-0 xl:flex-col xl:overflow-hidden">
            <CardContent className="p-6 xl:min-h-0 xl:flex-1 xl:overflow-y-auto xl:overscroll-contain sm:p-8">
              <ResultsSection
                displayedResults={displayedResults}
                errorMessage={errorMessage}
                hasFinalResults={hasFinalResults}
                hasStartedSearch={hasStartedSearch}
                isLoading={isLoading}
                onSelectProduct={onSelectProduct}
                selectionMeta={selectionMeta}
                showPreviewResults={showPreviewResults}
                submittedQuery={submittedQuery}
                variant="current"
              />
            </CardContent>
          </Card>
        </section>
      </div>
    </main>
  )
}

function HeroLayout(props) {
  const {
    displayedResults,
    errorMessage,
    hasFinalResults,
    hasStartedSearch,
    isLoading,
    onFinalize,
    onSelectProduct,
    onShowProductsNow,
    prompt,
    selectionMeta,
    selectedPriorities,
    setFollowUpNotes,
    setProductQuery,
    showPreviewResults,
    state,
    submittedQuery,
    togglePriority,
  } = props

  return (
    <main className="px-3 py-4 sm:px-6 sm:py-6 lg:px-8">
      <div className="mx-auto flex max-w-7xl flex-col gap-6">
        <section className="rounded-[36px] border border-white/70 bg-[linear-gradient(135deg,rgba(255,255,255,0.88),rgba(248,243,235,0.86))] p-6 shadow-[0_30px_120px_-60px_rgba(15,23,42,0.35)] backdrop-blur sm:p-8 lg:p-10">
          <div className="grid gap-8 lg:grid-cols-[1.1fr_0.9fr] lg:items-center">
            <SearchForm
              accentBadge="Strong hero variant"
              ctaLabel="Build my shortlist"
              helperText="Tell Focama what you are shopping for and it will narrow the strongest options based on what actually matters to you."
              heroTitle="Find the right product before the marketplace noise takes over."
              isLoading={isLoading}
              onSubmit={state.beginGuidedSearch}
              productQuery={state.productQuery}
              setProductQuery={setProductQuery}
              suggestions={['office chair', 'air fryer', 'travel stroller']}
            />

            <div className="space-y-4 rounded-[32px] border border-stone-200/70 bg-white/82 p-5 shadow-[0_24px_80px_-52px_rgba(15,23,42,0.24)]">
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">
                What users get
              </p>
              <div className="space-y-4">
                {[
                  'A focused shortlist of six products',
                  'Clear reasons and tradeoffs for each pick',
                  'An AI follow-up that narrows what actually matters',
                ].map((item) => (
                  <div key={item} className="flex items-start gap-3">
                    <span className="mt-1 flex h-6 w-6 items-center justify-center rounded-full bg-primary/10 text-primary">
                      <Check className="h-3.5 w-3.5" />
                    </span>
                    <p className="text-sm leading-6 text-slate-700">{item}</p>
                  </div>
                ))}
              </div>
              <div className="grid gap-3 sm:grid-cols-2">
                {RESULT_CARD_SLOTS.slice(0, 2).map((index) => (
                  <ResultSkeleton key={index} />
                ))}
              </div>
            </div>
          </div>
        </section>

        {hasStartedSearch ? (
          <section className="rounded-[32px] border border-white/70 bg-white/74 p-4 shadow-[0_30px_120px_-60px_rgba(15,23,42,0.28)] backdrop-blur sm:p-6">
            <RefinementCard
              candidatePool={state.candidatePool}
              followUpNotes={state.followUpNotes}
              isFinalizing={state.isFinalizing}
              onFinalize={onFinalize}
              onShowNow={onShowProductsNow}
              prompt={prompt}
              selectedPriorities={selectedPriorities}
              setFollowUpNotes={setFollowUpNotes}
              togglePriority={togglePriority}
            />
          </section>
        ) : null}

        <section className="rounded-[32px] border border-white/70 bg-white/72 p-4 shadow-[0_30px_120px_-60px_rgba(15,23,42,0.28)] backdrop-blur sm:p-6">
          <ResultsSection
            displayedResults={displayedResults}
            errorMessage={errorMessage}
            hasFinalResults={hasFinalResults}
            hasStartedSearch={hasStartedSearch}
            isLoading={isLoading}
            onSelectProduct={onSelectProduct}
            selectionMeta={selectionMeta}
            showPreviewResults={showPreviewResults}
            submittedQuery={submittedQuery}
            variant="hero"
          />
        </section>
      </div>
    </main>
  )
}

function FlowLayout(props) {
  const refinementRef = useRef(null)
  const {
    displayedResults,
    errorMessage,
    hasFinalResults,
    hasStartedSearch,
    isLoading,
    onFinalize,
    onSelectProduct,
    onShowProductsNow,
    prompt,
    selectionMeta,
    selectedPriorities,
    setFollowUpNotes,
    setProductQuery,
    showPreviewResults,
    state,
    submittedQuery,
    togglePriority,
  } = props

  useEffect(() => {
    if (hasStartedSearch && refinementRef.current) {
      refinementRef.current.scrollIntoView({ behavior: 'smooth', block: 'start' })
    }
  }, [hasStartedSearch])

  return (
    <main className="px-3 py-4 sm:px-6 sm:py-6 lg:px-8">
      <div className="mx-auto flex max-w-6xl flex-col gap-6">
        <section className="rounded-[36px] border border-white/70 bg-[linear-gradient(180deg,rgba(255,255,255,0.8),rgba(248,243,235,0.92))] p-6 shadow-[0_30px_120px_-60px_rgba(15,23,42,0.3)] backdrop-blur sm:p-8 lg:p-10">
          <SearchForm
            accentBadge="Flowing variant"
            ctaLabel="Start the guided flow"
            helperText="Start with the product. Focama asks the next useful question while the shortlist quietly forms underneath."
            heroTitle="A calmer buying journey that unfolds one step at a time."
            isLoading={isLoading}
            onSubmit={state.beginGuidedSearch}
            productQuery={state.productQuery}
            setProductQuery={setProductQuery}
            suggestions={['desk lamp', 'running shoes', 'robot vacuum']}
          />
        </section>

        <section ref={refinementRef} className="space-y-4">
          <div className="space-y-2 px-1">
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">
              Step 2
            </p>
            <h2 className="text-2xl font-semibold tracking-tight text-slate-900 sm:text-3xl">
              Narrow what matters before the shortlist takes center stage.
            </h2>
          </div>
          <RefinementCard
            candidatePool={state.candidatePool}
            followUpNotes={state.followUpNotes}
            isFinalizing={state.isFinalizing}
            onFinalize={onFinalize}
            onShowNow={onShowProductsNow}
            prompt={prompt}
            selectedPriorities={selectedPriorities}
            setFollowUpNotes={setFollowUpNotes}
            togglePriority={togglePriority}
          />
        </section>

        <section className="space-y-4">
          <div className="space-y-2 px-1">
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">
              Step 3
            </p>
            <h2 className="text-2xl font-semibold tracking-tight text-slate-900 sm:text-3xl">
              Reveal the shortlist when you are ready.
            </h2>
          </div>
          <div className="rounded-[32px] border border-white/70 bg-white/72 p-4 shadow-[0_30px_120px_-60px_rgba(15,23,42,0.28)] backdrop-blur sm:p-6">
            <ResultsSection
              displayedResults={displayedResults}
              errorMessage={errorMessage}
              hasFinalResults={hasFinalResults}
              hasStartedSearch={hasStartedSearch}
              isLoading={isLoading}
              onSelectProduct={onSelectProduct}
              selectionMeta={selectionMeta}
              showPreviewResults={showPreviewResults}
              submittedQuery={submittedQuery}
              variant="flow"
            />
          </div>
        </section>
      </div>
    </main>
  )
}

function ConciergeLayout(props) {
  const {
    displayedResults,
    errorMessage,
    hasFinalResults,
    hasStartedSearch,
    isLoading,
    onFinalize,
    onSelectProduct,
    onShowProductsNow,
    prompt,
    selectionMeta,
    selectedPriorities,
    setFollowUpNotes,
    setProductQuery,
    showPreviewResults,
    state,
    submittedQuery,
    togglePriority,
  } = props

  return (
    <main className="px-3 py-4 sm:px-6 sm:py-6 lg:px-8">
      <div className="mx-auto flex max-w-6xl flex-col gap-6">
        <section className="rounded-[36px] border border-white/70 bg-[linear-gradient(135deg,rgba(255,248,238,0.9),rgba(255,255,255,0.76))] p-6 shadow-[0_30px_120px_-60px_rgba(15,23,42,0.28)] backdrop-blur sm:p-8 lg:p-10">
          <div className="grid gap-6 lg:grid-cols-[1.1fr_0.9fr] lg:items-start">
            <SearchForm
              accentBadge="Concierge variant"
              ctaLabel="Start search"
              helperText="More like a calm personal shopper than a search box. Start with the product, then let Focama help you sort the tradeoffs."
              heroTitle="What are you shopping for today?"
              isLoading={isLoading}
              onSubmit={state.beginGuidedSearch}
              productQuery={state.productQuery}
              setProductQuery={setProductQuery}
              suggestions={['carry-on suitcase', 'coffee grinder', 'kids tablet']}
            />

            <div className="rounded-[32px] border border-stone-200/70 bg-white/82 p-5">
              <p className="text-sm leading-7 text-slate-700">
                Focama is strongest when the product search feels thoughtful, not frantic.
                Shoppers tell us they want fewer tabs, clearer tradeoffs, and enough choice to feel
                confident. That is why this experiment keeps the shortlist generous at six items.
              </p>
            </div>
          </div>
        </section>

        {hasStartedSearch ? (
          <RefinementCard
            candidatePool={state.candidatePool}
            followUpNotes={state.followUpNotes}
            isFinalizing={state.isFinalizing}
            onFinalize={onFinalize}
            onShowNow={onShowProductsNow}
            prompt={prompt}
            selectedPriorities={selectedPriorities}
            setFollowUpNotes={setFollowUpNotes}
            togglePriority={togglePriority}
            tone="concierge"
          />
        ) : null}

        <div className="rounded-[32px] border border-white/70 bg-white/72 p-4 shadow-[0_30px_120px_-60px_rgba(15,23,42,0.28)] backdrop-blur sm:p-6">
          <ResultsSection
            displayedResults={displayedResults}
            errorMessage={errorMessage}
            hasFinalResults={hasFinalResults}
            hasStartedSearch={hasStartedSearch}
            isLoading={isLoading}
            onSelectProduct={onSelectProduct}
            selectionMeta={selectionMeta}
            showPreviewResults={showPreviewResults}
            submittedQuery={submittedQuery}
            variant="concierge"
          />
        </div>
      </div>
    </main>
  )
}

function InstantLayout(props) {
  const {
    displayedResults,
    errorMessage,
    hasFinalResults,
    hasStartedSearch,
    isLoading,
    onFinalize,
    onSelectProduct,
    onShowProductsNow,
    prompt,
    selectionMeta,
    selectedPriorities,
    setFollowUpNotes,
    setProductQuery,
    showPreviewResults,
    state,
    submittedQuery,
    togglePriority,
  } = props

  return (
    <main className="px-3 py-4 sm:px-6 sm:py-6 lg:px-8">
      <div className="mx-auto flex max-w-7xl flex-col gap-6">
        <section className="rounded-[36px] border border-white/70 bg-[linear-gradient(135deg,rgba(255,255,255,0.84),rgba(241,247,246,0.9))] p-6 shadow-[0_30px_120px_-60px_rgba(15,23,42,0.3)] backdrop-blur sm:p-8 lg:p-10">
          <div className="grid gap-8 lg:grid-cols-[1fr_1fr] lg:items-center">
            <SearchForm
              accentBadge="Instant results variant"
              ctaLabel="See picks faster"
              helperText="This version sells speed first. Shoppers see what kind of shortlist they will get before they ever start."
              heroTitle="Skip the tab chaos and get to a sharper shortlist faster."
              isLoading={isLoading}
              onSubmit={state.beginGuidedSearch}
              productQuery={state.productQuery}
              setProductQuery={setProductQuery}
              suggestions={['standing desk', 'wireless earbuds', 'air purifier']}
            />

            <div className="grid gap-4 sm:grid-cols-2">
              {RESULT_CARD_SLOTS.map((index) => (
                <ResultSkeleton key={index} />
              ))}
            </div>
          </div>
        </section>

        {hasStartedSearch ? (
          <div className="rounded-[32px] border border-white/70 bg-white/72 p-4 shadow-[0_30px_120px_-60px_rgba(15,23,42,0.28)] backdrop-blur sm:p-6">
            <RefinementCard
              candidatePool={state.candidatePool}
              followUpNotes={state.followUpNotes}
              isFinalizing={state.isFinalizing}
              onFinalize={onFinalize}
              onShowNow={onShowProductsNow}
              prompt={prompt}
              selectedPriorities={selectedPriorities}
              setFollowUpNotes={setFollowUpNotes}
              togglePriority={togglePriority}
            />
          </div>
        ) : null}

        <div className="rounded-[32px] border border-white/70 bg-white/72 p-4 shadow-[0_30px_120px_-60px_rgba(15,23,42,0.28)] backdrop-blur sm:p-6">
          <ResultsSection
            displayedResults={displayedResults}
            errorMessage={errorMessage}
            hasFinalResults={hasFinalResults}
            hasStartedSearch={hasStartedSearch}
            isLoading={isLoading}
            onSelectProduct={onSelectProduct}
            selectionMeta={selectionMeta}
            showPreviewResults={showPreviewResults}
            submittedQuery={submittedQuery}
            variant="instant"
          />
        </div>
      </div>
    </main>
  )
}

export function HomeExperience({ variant = 'current' }) {
  const state = useGuidedSearch()

  const layoutProps = {
    displayedResults: state.displayedResults,
    errorMessage: state.errorMessage,
    hasFinalResults: state.hasFinalResults,
    hasStartedSearch: state.hasStartedSearch,
    isLoading: state.isLoading,
    onFinalize: state.handleFinalizeRefinement,
    onSelectProduct: state.setSelectedProduct,
    onShowProductsNow: state.handleShowProductsNow,
    prompt: state.refinementPrompt,
    selectionMeta: state.selectionMeta,
    selectedPriorities: state.selectedPriorities,
    setFollowUpNotes: state.setFollowUpNotes,
    setProductQuery: state.setProductQuery,
    showPreviewResults: state.showPreviewResults,
    state,
    submittedQuery: state.submittedQuery,
    togglePriority: state.togglePriority,
  }

  const layouts = {
    concierge: ConciergeLayout,
    current: CurrentLayout,
    flow: FlowLayout,
    hero: HeroLayout,
    instant: InstantLayout,
  }

  const Layout = layouts[variant] || CurrentLayout

  return (
    <>
      <div className="px-3 pt-4 sm:px-6 lg:px-8">
        <div className="mx-auto max-w-7xl">
          <VariantPicker />
        </div>
      </div>
      <Layout {...layoutProps} />
      {state.selectedProduct ? (
        <ProductDetailModal item={state.selectedProduct} onClose={() => state.setSelectedProduct(null)} />
      ) : null}
    </>
  )
}
