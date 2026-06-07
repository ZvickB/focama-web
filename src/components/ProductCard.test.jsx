import { render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

import ProductCard from './ProductCard.jsx'

describe('ProductCard', () => {
  it('uses the provided retailer display name in the clickout CTA', () => {
    render(
      <ProductCard
        title="Travel stroller"
        subtitle="Amazon"
        price="$129.99"
        rating={4.4}
        reviewCount={87}
        description="Lightweight and easy to fold."
        reasons={[]}
        image="https://example.com/stroller.jpg"
        link="https://example.com/stroller"
        retailerLabel="Amazon.ca"
        onSelect={vi.fn()}
      />,
    )

    expect(screen.getByRole('link', { name: /view on amazon\.ca/i })).toBeInTheDocument()
  })

  it('hides generic marketplace availability copy from the standout callout', () => {
    render(
      <ProductCard
        title="Travel stroller"
        subtitle="Amazon"
        price="$129.99"
        rating={4.4}
        reviewCount={87}
        description="Lightweight and easy to fold."
        reasons={['Available from Amazon', 'Listed around $129.99']}
        image="https://example.com/stroller.jpg"
        link="https://example.com/stroller"
        onSelect={vi.fn()}
      />,
    )

    expect(screen.queryByText(/why it stands out:/i)).not.toBeInTheDocument()
    expect(screen.queryByText(/available from amazon/i)).not.toBeInTheDocument()
  })

  it('still shows specific standout reasons when present', () => {
    render(
      <ProductCard
        title="Travel stroller"
        subtitle="Amazon"
        price="$129.99"
        rating={4.4}
        reviewCount={87}
        description="Lightweight and easy to fold."
        reasons={['Available from Amazon', 'Excellent heat retention for long commutes.']}
        image="https://example.com/stroller.jpg"
        link="https://example.com/stroller"
        onSelect={vi.fn()}
      />,
    )

    expect(screen.getByText(/why it stands out:/i)).toBeInTheDocument()
    expect(screen.getByText(/excellent heat retention for long commutes\./i)).toBeInTheDocument()
  })
})
