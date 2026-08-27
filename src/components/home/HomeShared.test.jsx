import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'

import { AmazonStoreProvider } from '@/contexts/AmazonStoreContext.jsx'
import { useAmazonStore } from '@/contexts/useAmazonStore.js'
import { FinalizeLoadingState } from './FinalizeLoadingState.jsx'
import { ProductDetailModal } from './ProductDetailModal.jsx'
import { ResultsSectionFallback } from './home-components.jsx'
import { ResultsSection } from './ResultsSection.jsx'

afterEach(() => {
  cleanup()
})

function createMockItem(overrides = {}) {
  return {
    id: 'result-1',
    title: 'Ice cream maker',
    subtitle: 'Amazon',
    price: '$129.99',
    rating: 4.4,
    reviewCount: 87,
    description: 'Makes small batches at home.',
    fit_reason: '',
    caveat: '',
    feature_bullets: ['2-quart bowl', 'Simple cleanup'],
    image: 'https://example.com/ice-cream-maker.jpg',
    link: 'https://example.com/ice-cream-maker',
    ...overrides,
  }
}

function renderModal(props = {}) {
  return render(
    <MemoryRouter>
      <AmazonStoreProvider>
        <ProductDetailModal
          item={createMockItem()}
          isEnrichmentSettled={false}
          onClose={vi.fn()}
          onRetailerClick={vi.fn()}
          {...props}
        />
      </AmazonStoreProvider>
    </MemoryRouter>,
  )
}

function MarketplacePreferenceHarness() {
  const { clearMarketplacePreference, selectedAmazonDomain } = useAmazonStore()

  return (
    <>
      <button type="button" onClick={clearMarketplacePreference}>
        Clear marketplace preference
      </button>
      <span>{selectedAmazonDomain}</span>
    </>
  )
}

describe('ProductDetailModal', () => {
  afterEach(() => {
    cleanup()
    document.body.style.overflow = ''
  })

  it('replaces the analyzing state with a fallback message once enrichment is settled without a fit reason', () => {
    renderModal({
      isEnrichmentSettled: true,
    })

    expect(screen.getByText(/extra analysis wasn't available for this pick right now/i)).toBeInTheDocument()
    expect(screen.queryByText(/analyzing your pick/i)).not.toBeInTheDocument()
  })

  it('uses branded breathing dots while recommendation details hydrate', () => {
    renderModal()

    expect(screen.queryByText(/checking why this fits your search/i)).not.toBeInTheDocument()
    expect(screen.getByLabelText(/recommendation details loading/i)).toBeInTheDocument()
  })

  it('hides recommendation analysis for preview products', () => {
    renderModal({
      showRecommendationAnalysis: false,
    })

    expect(screen.queryByLabelText(/recommendation details loading/i)).not.toBeInTheDocument()
    expect(screen.queryByText(/extra analysis wasn't available for this pick right now/i)).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /watch price/i })).not.toBeInTheDocument()
  })

  it('shows the price watch action for finalized products only', () => {
    renderModal({
      item: createMockItem({
        numericPrice: 129.99,
      }),
      showRecommendationAnalysis: true,
    })

    expect(screen.getByRole('button', { name: /watch price/i })).toBeInTheDocument()
  })

  it('shows one compact affiliate disclosure next to the retailer CTA', () => {
    renderModal()

    expect(
      screen.getByText(/as an amazon associate, focamai may earn from qualifying purchases/i),
    ).toBeInTheDocument()
  })

  it('shows confirmed Prime eligibility without showing shortlist rank metadata', () => {
    renderModal({
      item: createMockItem({
        badgeLabel: 'Best match',
        is_prime: true,
      }),
    })

    expect(screen.getByText('Delivery')).toBeInTheDocument()
    expect(screen.getByText(/prime eligible/i)).toBeInTheDocument()
    expect(screen.queryByText(/shortlist rank/i)).not.toBeInTheDocument()
  })

  it('shows free delivery as delivery information without implying Prime', () => {
    renderModal({
      item: createMockItem({
        delivery: 'FREE delivery Sat, Jun 13 on your first order',
        is_prime: false,
      }),
    })

    expect(screen.getByText('Delivery')).toBeInTheDocument()
    expect(screen.getByText(/free delivery/i)).toBeInTheDocument()
    expect(screen.queryByText(/prime eligible/i)).not.toBeInTheDocument()
  })
})

describe('FinalizeLoadingState', () => {
  it('names the submitted search and active saved preference while finalizing', () => {
    render(
      <FinalizeLoadingState
        rankingPreference="price"
        submittedQuery="wireless headphones"
      />,
    )

    expect(
      screen.getByText(/searching for wireless headphones with your prefer lower prices preference/i),
    ).toBeInTheDocument()
  })

  it('keeps the preference reminder out of balanced finalizes', () => {
    render(<FinalizeLoadingState rankingPreference="balanced" submittedQuery="wireless headphones" />)

    expect(screen.queryByText(/with your .* preference/i)).not.toBeInTheDocument()
  })
})

describe('ResultsSection retry advice', () => {
  it('shows a calm background-search message while refinement is still active', () => {
    render(
      <ResultsSection
        displayedResults={[]}
        errorMessage=""
        hasFinalResults={false}
        hasStartedSearch
        isFinalizing={false}
        isLoading={false}
        isRetryReady
        isRetrying={false}
        isGeneratingRetryAdvice={false}
        onRetailerClick={vi.fn()}
        onSelectProduct={vi.fn()}
        onRetryAdviceRequest={vi.fn()}
        onRetryFeedbackChange={vi.fn()}
        previousResults={[]}
        retryFeedback=""
        showFinalResultBadges={false}
        showPreviewResults={false}
        submittedQuery="office chair"
      />,
    )

    expect(screen.getByText('Finding your best options…')).toBeInTheDocument()
    expect(
      screen.getByText('We’re gathering products in the background while you tell us what matters.'),
    ).toBeInTheDocument()
    expect(screen.queryByText(/couldn't build a strong shortlist yet/i)).not.toBeInTheDocument()
  })

  it('shows the improved search and the active retry stage while replacement picks load', () => {
    render(
      <ResultsSectionFallback
        isDiscovering
        retrySearchQuery="lightweight travel stroller under $200"
      />,
    )

    expect(screen.getByText('Updating your picks')).toBeInTheDocument()
    expect(screen.getByText('lightweight travel stroller under $200')).toBeInTheDocument()
    expect(screen.getByRole('status')).toHaveTextContent('Finding better matches…')
  })

  it('keeps improvement suggestions hidden until the correction panel opens, then fills the feedback field', () => {
    const onRetryFeedbackChange = vi.fn()

    render(
      <ResultsSection
        displayedResults={[createMockItem()]}
        errorMessage=""
        hasFinalResults
        hasStartedSearch
        improvePicksSuggestions={[
          { label: 'Lower price', feedback: 'I want lower-priced options that still meet my important needs.' },
        ]}
        isFinalizing={false}
        isLoading={false}
        isRetryReady
        isRetrying={false}
        isGeneratingRetryAdvice={false}
        onRetailerClick={vi.fn()}
        onSelectProduct={vi.fn()}
        onRetryAdviceRequest={vi.fn()}
        onRetryFeedbackChange={onRetryFeedbackChange}
        retryFeedback=""
        showFinalResultBadges={false}
        showPreviewResults={false}
        submittedQuery="stroller"
      />,
    )

    expect(screen.queryByRole('button', { name: 'Lower price' })).not.toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: /improve picks/i }))
    fireEvent.click(screen.getByRole('button', { name: 'Lower price' }))

    expect(onRetryFeedbackChange).toHaveBeenCalledWith(
      'I want lower-priced options that still meet my important needs.',
    )
  })

  it('offers a better search instead of padding a partial shortlist', () => {
    const onFindBetterMatches = vi.fn()
    const onKeepCandidateRecovery = vi.fn()

    render(
      <ResultsSection
        candidateRecovery={{ goodCandidateCount: 3, suggestedQuery: 'lightweight carry-on stroller under $200' }}
        displayedResults={[createMockItem()]}
        errorMessage=""
        hasFinalResults
        hasStartedSearch
        isFinalizing={false}
        isLoading={false}
        isRetryReady
        isRetrying={false}
        isGeneratingRetryAdvice={false}
        onFindBetterMatches={onFindBetterMatches}
        onKeepCandidateRecovery={onKeepCandidateRecovery}
        onRetailerClick={vi.fn()}
        onSelectProduct={vi.fn()}
        onRetryAdviceRequest={vi.fn()}
        onRetryFeedbackChange={vi.fn()}
        retryFeedback=""
        showFinalResultBadges={false}
        showPreviewResults={false}
        submittedQuery="stroller"
      />,
    )

    expect(screen.getByText(/these are the strongest matches we found/i)).toBeInTheDocument()
    expect(screen.getByText('lightweight carry-on stroller under $200')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: /find better matches/i }))
    expect(onFindBetterMatches).toHaveBeenCalledWith('lightweight carry-on stroller under $200')
    fireEvent.click(screen.getByRole('button', { name: /keep these picks/i }))
    expect(onKeepCandidateRecovery).toHaveBeenCalledTimes(1)
  })

  it('shows Prime availability on result surfaces when confirmed', () => {
    render(
      <ResultsSection
        displayedResults={[
          createMockItem({
            is_prime: true,
          }),
        ]}
        errorMessage=""
        hasFinalResults
        hasStartedSearch
        isEnrichmentSettled
        isFinalizing={false}
        isLoading={false}
        isRetryReady
        isRetrying={false}
        isGeneratingRetryAdvice={false}
        onRetailerClick={vi.fn()}
        onSelectProduct={vi.fn()}
        onRetryAdviceRequest={vi.fn()}
        onRetryFeedbackChange={vi.fn()}
        previousResults={[]}
        retryAdvice={null}
        selectionState={null}
        retryCount={0}
        retryFeedback=""
        showFinalResultBadges={false}
        showPreviewResults={false}
        suggestedRetryQuery=""
        submittedQuery="ice cream maker"
      />,
    )

    expect(screen.getAllByText('Prime').length).toBeGreaterThan(0)
  })

  it('leaves preview result reason copy blank when no user-facing detail exists', () => {
    render(
      <ResultsSection
        displayedResults={[
          createMockItem({
            description: '',
            feature_bullets: [],
            reasons: [],
          }),
        ]}
        errorMessage=""
        hasFinalResults={false}
        hasStartedSearch
        isEnrichmentSettled={false}
        isFinalizing={false}
        isLoading={false}
        isRetryReady
        isRetrying={false}
        isGeneratingRetryAdvice={false}
        onRetailerClick={vi.fn()}
        onSelectProduct={vi.fn()}
        onRetryAdviceRequest={vi.fn()}
        onRetryFeedbackChange={vi.fn()}
        previousResults={[]}
        retryAdvice={null}
        selectionState={null}
        retryCount={0}
        retryFeedback=""
        showFinalResultBadges={false}
        showPreviewResults
        suggestedRetryQuery=""
        submittedQuery="ice cream maker"
      />,
    )

    expect(screen.queryByText(/a credible option from the first pass/i)).not.toBeInTheDocument()
  })

  it('uses breathing dots instead of uncertain explanation copy while row reasons hydrate', () => {
    render(
      <ResultsSection
        displayedResults={[
          createMockItem({
            description: '',
            feature_bullets: [],
            reasons: [],
          }),
        ]}
        errorMessage=""
        hasFinalResults
        hasStartedSearch
        isEnrichmentSettled={false}
        isFinalizing={false}
        isLoading={false}
        isRetryReady
        isRetrying={false}
        isGeneratingRetryAdvice={false}
        onRetailerClick={vi.fn()}
        onSelectProduct={vi.fn()}
        onRetryAdviceRequest={vi.fn()}
        onRetryFeedbackChange={vi.fn()}
        previousResults={[]}
        retryAdvice={null}
        selectionState={null}
        retryCount={0}
        retryFeedback=""
        showFinalResultBadges={false}
        showPreviewResults={false}
        suggestedRetryQuery=""
        submittedQuery="ice cream maker"
      />,
    )

    expect(screen.queryByText(/checking why this fits your search/i)).not.toBeInTheDocument()
    expect(screen.getAllByLabelText(/recommendation details loading/i).length).toBeGreaterThan(0)
  })

  it('labels retailer clickouts with the product source name', () => {
    render(
      <ResultsSection
        displayedResults={[
          createMockItem({ id: 'result-1', title: 'First ice cream maker', subtitle: 'Amazon' }),
          createMockItem({ id: 'result-2', title: 'Second ice cream maker', subtitle: 'AliExpress' }),
        ]}
        errorMessage=""
        hasFinalResults
        hasStartedSearch
        isFinalizing={false}
        isLoading={false}
        isRetryReady
        isRetrying={false}
        isGeneratingRetryAdvice={false}
        onRetailerClick={vi.fn()}
        onSelectProduct={vi.fn()}
        onRetryAdviceRequest={vi.fn()}
        onRetryFeedbackChange={vi.fn()}
        previousResults={[]}
        retryAdvice={null}
        selectionState={null}
        retryCount={0}
        retryFeedback=""
        showFinalResultBadges={false}
        showPreviewResults={false}
        suggestedRetryQuery=""
        submittedQuery="ice cream maker"
      />,
    )

    expect(screen.getByRole('link', { name: /view on amazon/i })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: /view on aliexpress/i })).toBeInTheDocument()
    expect(screen.getAllByText(/amazon/i)).toHaveLength(1)
  })

  it('updates the selected desktop result preview on row hover', () => {
    render(
      <ResultsSection
        displayedResults={[
          createMockItem({ id: 'result-1', title: 'First ice cream maker' }),
          createMockItem({ id: 'result-2', title: 'Second ice cream maker' }),
        ]}
        errorMessage=""
        hasFinalResults
        hasStartedSearch
        isFinalizing={false}
        isLoading={false}
        isRetryReady
        isRetrying={false}
        isGeneratingRetryAdvice={false}
        onRetailerClick={vi.fn()}
        onSelectProduct={vi.fn()}
        onRetryAdviceRequest={vi.fn()}
        onRetryFeedbackChange={vi.fn()}
        previousResults={[]}
        retryAdvice={null}
        selectionState={null}
        retryCount={0}
        retryFeedback=""
        showFinalResultBadges={false}
        showPreviewResults={false}
        suggestedRetryQuery=""
        submittedQuery="ice cream maker"
      />,
    )

    expect(
      screen.getByRole('button', { name: /open selected result details: first ice cream maker/i }),
    ).toBeInTheDocument()

    fireEvent.mouseEnter(screen.getByText('Second ice cream maker').closest('button'))

    expect(
      screen.getByRole('button', { name: /open selected result details: second ice cream maker/i }),
    ).toBeInTheDocument()
  })

  it('does not require a second suggested-query confirmation', () => {
    const handleRetrySearch = vi.fn()

    render(
      <ResultsSection
        displayedResults={[]}
        errorMessage=""
        hasFinalResults
        hasStartedSearch
        isFinalizing={false}
        isLoading={false}
        isRetryReady
        isRetrying={false}
        isGeneratingRetryAdvice={false}
        onRetailerClick={vi.fn()}
        onSelectProduct={vi.fn()}
        onRetryAdviceRequest={vi.fn()}
        onRetryFeedbackChange={vi.fn()}
        onRetrySearch={handleRetrySearch}
        previousResults={[]}
        retryAdvice={{
          rationale: 'The first search was too broad for the kind of product you described.',
        }}
        selectionState={null}
        retryCount={0}
        retryFeedback="too broad"
        showFinalResultBadges={false}
        showPreviewResults={false}
        suggestedRetryQuery="compact carry on stroller"
        submittedQuery="stroller"
      />,
    )

    fireEvent.click(screen.getByRole('button', { name: /improve picks/i }))

    expect(screen.queryByLabelText(/next search/i)).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /search again/i })).not.toBeInTheDocument()
    expect(handleRetrySearch).not.toHaveBeenCalled()
  })
})
describe('AmazonStoreProvider', () => {
  it('clears the saved marketplace preference and resets back to auto', () => {
    window.__FOCAMAI_DISABLE_GEO_FETCH__ = true
    window.localStorage.setItem('focamai_marketplace', 'amazon.ca')

    render(
      <AmazonStoreProvider>
        <MarketplacePreferenceHarness />
      </AmazonStoreProvider>,
    )

    expect(screen.getByText('amazon.ca')).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: /clear marketplace preference/i }))

    expect(window.localStorage.getItem('focamai_marketplace')).toBeNull()
    expect(window.localStorage.getItem('focamai_marketplace_asked')).toBeNull()
    expect(screen.getByText('auto')).toBeInTheDocument()

    delete window.__FOCAMAI_DISABLE_GEO_FETCH__
  })
})
