import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, render, screen } from '@testing-library/react'

import { AmazonStoreProvider } from '@/contexts/AmazonStoreContext.jsx'
import { ProductDetailModal } from './HomeShared.jsx'

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
