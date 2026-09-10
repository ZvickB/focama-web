import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'

import { AmazonStoreProvider } from '@/contexts/AmazonStoreContext.jsx'
import { ProductDetailModal } from './ProductDetailModal.jsx'
import { ResultsSection } from './ResultsSection.jsx'

afterEach(cleanup)

function item(overrides = {}) {
  return {
    id: 'result-1',
    title: 'Ice cream maker',
    subtitle: 'Amazon',
    price: '$129.99',
    numericPrice: 129.99,
    image: 'https://example.com/product.jpg',
    link: 'https://example.com/product',
    feature_bullets: [],
    ...overrides,
  }
}

function renderModal(props = {}) {
  return render(
    <MemoryRouter>
      <AmazonStoreProvider>
        <ProductDetailModal
          item={item()}
          isEnrichmentSettled={false}
          onClose={vi.fn()}
          onRetailerClick={vi.fn()}
          {...props}
        />
      </AmazonStoreProvider>
    </MemoryRouter>,
  )
}

const resultProps = {
  errorMessage: '',
  hasFinalResults: true,
  hasStartedSearch: true,
  isFinalizing: false,
  isLoading: false,
  isRetryReady: true,
  isRetrying: false,
  isGeneratingRetryAdvice: false,
  onRetailerClick: vi.fn(),
  onSelectProduct: vi.fn(),
  onRetryAdviceRequest: vi.fn(),
  onRetryFeedbackChange: vi.fn(),
  retryFeedback: '',
  showFinalResultBadges: false,
  showPreviewResults: false,
  submittedQuery: 'ice cream maker',
}

describe('result surfaces', () => {
  it('keeps recommendation analysis and price watching off preview products', () => {
    renderModal({ showRecommendationAnalysis: false })

    expect(screen.queryByLabelText(/recommendation details loading/i)).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /watch price/i })).not.toBeInTheDocument()
  })

  it('shows the finalized-product price watch action and affiliate disclosure', () => {
    renderModal({ showRecommendationAnalysis: true })

    expect(screen.getByRole('button', { name: /watch price/i })).toBeInTheDocument()
    expect(screen.getByText(/amazon associate/i)).toBeInTheDocument()
  })

  it('distinguishes confirmed Prime from ordinary free delivery', () => {
    const { unmount } = renderModal({ item: item({ is_prime: true }) })
    expect(screen.getByText(/prime eligible/i)).toBeInTheDocument()
    unmount()

    renderModal({ item: item({ is_prime: false, delivery: 'FREE delivery Saturday' }) })
    expect(screen.getByText(/free delivery/i)).toBeInTheDocument()
    expect(screen.queryByText(/prime eligible/i)).not.toBeInTheDocument()
  })

  it('offers the AI-suggested search instead of padding a partial shortlist', () => {
    const onFindBetterMatches = vi.fn()
    render(
      <ResultsSection
        {...resultProps}
        candidateRecovery={{ goodCandidateCount: 3, suggestedQuery: 'carry-on stroller under $200' }}
        displayedResults={[item()]}
        followUpNotes="automatic fold and under $200"
        onFindBetterMatches={onFindBetterMatches}
        onKeepCandidateRecovery={vi.fn()}
      />,
    )

    expect(screen.getByText(/we found only 3 strong matches/i)).toBeInTheDocument()
    expect(screen.getByText(/keeping your details/i)).toBeInTheDocument()
    expect(screen.getByText('automatic fold and under $200')).toBeInTheDocument()
    expect(screen.getByText(/runs automatically and replaces this shortlist/i)).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: /find better matches/i }))
    expect(onFindBetterMatches).toHaveBeenCalledWith('carry-on stroller under $200')
  })

  it('derives clickout labels from each product source', () => {
    render(
      <ResultsSection
        {...resultProps}
        displayedResults={[item(), item({ id: 'result-2', subtitle: 'AliExpress' })]}
      />,
    )

    expect(screen.getByRole('link', { name: /view on amazon/i })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: /view on aliexpress/i })).toBeInTheDocument()
  })
})
