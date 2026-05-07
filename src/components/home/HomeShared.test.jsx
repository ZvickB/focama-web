import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'

import { AmazonStoreProvider } from '@/contexts/AmazonStoreContext.jsx'
import { ProductDetailModal, ResultsSection } from './HomeShared.jsx'

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
    <AmazonStoreProvider>
      <ProductDetailModal
        item={createMockItem()}
        isEnrichmentSettled={false}
        onClose={vi.fn()}
        onRetailerClick={vi.fn()}
        {...props}
      />
    </AmazonStoreProvider>,
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
})

describe('ResultsSection retry advice', () => {
  it('shows a simple jump action instead of an inline suggested query editor', () => {
    const handleJumpToSearchForm = vi.fn()

    render(
      <ResultsSection
        displayedResults={[]}
        errorMessage=""
        hasFinalResults
        hasLoadedSuggestionAtTop
        hasStartedSearch
        isFinalizing={false}
        isLoading={false}
        isRetryReady
        isRetrying={false}
        isGeneratingRetryAdvice={false}
        onJumpToSearchForm={handleJumpToSearchForm}
        onRetailerClick={vi.fn()}
        onSelectProduct={vi.fn()}
        onRetryAdviceRequest={vi.fn()}
        onRetryFeedbackChange={vi.fn()}
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

    fireEvent.click(screen.getByRole('button', { name: /not quite what you needed/i }))

    expect(screen.getByRole('button', { name: /go to search form/i })).toBeInTheDocument()
    expect(screen.queryByText(/suggestion loaded above/i)).not.toBeInTheDocument()
    expect(screen.queryByText(/scroll up to edit and try it/i)).not.toBeInTheDocument()
    expect(screen.queryByLabelText(/try this search/i)).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /use this search/i })).not.toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: /go to search form/i }))

    expect(handleJumpToSearchForm).toHaveBeenCalledTimes(1)
  })
})
