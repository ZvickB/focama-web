import { describe, expect, it } from 'vitest'

import {
  LAYERED_CONTRACTS,
  createEnrichmentContract,
  createFinalizeFastContract,
  createQueryFramingContract,
  toFinalizeFastCard,
} from './layered-contracts.js'

describe('layered contracts', () => {
  it('defines a query-framing contract that stays query-only and lightweight', () => {
    const contract = createQueryFramingContract({
      query: 'travel stroller',
      categoryHint: 'compact stroller',
      framingSummary: 'Focus on travel portability before brand preference.',
      tradeoffAxes: ['weight', 'fold size', 'durability', 'price', 'storage'],
      refinementHints: [
        'Ask about airline carry-on needs.',
        'Ask about daily city use.',
        'Ask whether one-hand fold matters.',
        'Ask about budget.',
        'Ask about recline.',
      ],
      generatedAt: '2026-04-12T00:00:00.000Z',
    })

    expect(contract).toEqual({
      version: LAYERED_CONTRACTS.queryFraming.version,
      layer: 'query_framing',
      query: 'travel stroller',
      categoryHint: 'compact stroller',
      framingSummary: 'Focus on travel portability before brand preference.',
      tradeoffAxes: ['weight', 'fold size', 'durability', 'price'],
      refinementHints: [
        'Ask about airline carry-on needs.',
        'Ask about daily city use.',
        'Ask whether one-hand fold matters.',
        'Ask about budget.',
      ],
      generatedAt: '2026-04-12T00:00:00.000Z',
    })
    expect(contract).not.toHaveProperty('candidates')
  })

  it('defines finalize-fast cards as shortlist-safe only', () => {
    const card = toFinalizeFastCard({
      id: 'prod-1',
      title: 'Compact airport stroller',
      source: 'Target',
      price: '$199.99',
      rating: 4.7,
      reviewCount: 342,
      isPrime: true,
      description: 'Lightweight stroller for flights',
      feature_bullets: ['One-hand fold', 'Carry-on friendly'],
      reasons: ['Fallback reason'],
      drawbacks: ['Should not be forwarded'],
      image: 'https://example.com/stroller.jpg',
      link: 'https://example.com/stroller',
    })

    expect(card).toEqual({
      id: 'prod-1',
      title: 'Compact airport stroller',
      subtitle: 'Target',
      price: '$199.99',
      numericPrice: null,
      rating: 4.7,
      reviewCount: 342,
      isPrime: true,
      delivery: '',
      description: 'Lightweight stroller for flights',
      feature_bullets: ['One-hand fold', 'Carry-on friendly'],
      image: 'https://example.com/stroller.jpg',
      link: 'https://example.com/stroller',
      badgeLabel: '',
    })
    expect(card).not.toHaveProperty('reasons')
    expect(card).not.toHaveProperty('drawbacks')
  })

  it('preserves provider Prime aliases in finalize-fast cards', () => {
    const card = toFinalizeFastCard({
      id: 'prod-1',
      title: 'Prime product',
      source: 'Amazon',
      price: '$99.99',
      is_prime: true,
      delivery: 'Free delivery',
    })

    expect(card.isPrime).toBe(true)
    expect(card.delivery).toBe('Free delivery')
  })

  it('defines an enrichment contract that explains a locked shortlist without ranking it again', () => {
    const finalizeFast = createFinalizeFastContract({
      query: 'travel stroller',
      latestUserContext: 'Needs to fit in overhead bins.',
      selectedCandidateIds: ['prod-2'],
      shortlist: [
        {
          id: 'prod-2',
          title: 'Compact airport stroller',
          source: 'Target',
          price: '$199.99',
          rating: 4.7,
          reviewCount: 342,
          description: 'Lightweight stroller for flights',
          reasons: ['AI fit: Best match for airport use.'],
          image: 'https://example.com/stroller.jpg',
          link: 'https://example.com/stroller',
        },
      ],
      model: 'gpt-5-mini',
      strategy: 'single_pass',
    })
    const enrichment = createEnrichmentContract({
      query: 'travel stroller',
      shortlistIds: finalizeFast.selectedCandidateIds,
      model: 'gpt-5-mini',
      entries: [
        {
          candidateId: 'prod-2',
          fitReason: 'Fits frequent travel because the fold is compact and easy to carry.',
          caveat: 'The price is a little higher than bulkier budget picks.',
          featureBullets: ['One-hand fold', 'Compact enough for airport days'],
        },
      ],
    })

    expect(enrichment).toEqual({
      version: LAYERED_CONTRACTS.enrichment.version,
      layer: 'enrichment',
      query: 'travel stroller',
      shortlistIds: ['prod-2'],
      generatedAt: null,
      model: 'gpt-5-mini',
      entries: [
        {
          candidateId: 'prod-2',
          fitReason: 'Fits frequent travel because the fold is compact and easy to carry.',
          caveat: 'The price is a little higher than bulkier budget picks.',
          featureBullets: ['One-hand fold', 'Compact enough for airport days'],
        },
      ],
    })
    expect(enrichment).not.toHaveProperty('selectedCandidateIds')
  })
})
