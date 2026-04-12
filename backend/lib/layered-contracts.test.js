import { describe, expect, it } from 'vitest'

import {
  LAYERED_CONTRACTS,
  createCandidateAwarePrewarmContract,
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

  it('defines a candidate-aware prewarm contract without locking a shortlist', () => {
    const contract = createCandidateAwarePrewarmContract({
      query: 'travel stroller',
      discoveryToken: 'guided_discovery:travel stroller|',
      candidateCount: 2,
      model: 'gpt-5-mini',
      rankedCandidates: [
        {
          candidateId: 'prod-2',
          rank: 1,
          title: 'Compact airport stroller',
          baselineFit: 'Best baseline fit for flights.',
          baselineCaution: 'Pricier than entry-level options.',
          attributes: ['compact', 'lightweight'],
          trustScore: 4,
        },
      ],
    })

    expect(contract.layer).toBe('candidate_aware_prewarm')
    expect(contract.rankedCandidates).toEqual([
      {
        candidateId: 'prod-2',
        prewarmRank: 1,
        title: 'Compact airport stroller',
        source: '',
        price: '',
        rating: null,
        reviewCount: null,
        attributes: ['compact', 'lightweight'],
        trustScore: 4,
        baselineFit: 'Best baseline fit for flights.',
        baselineCaution: 'Pricier than entry-level options.',
      },
    ])
    expect(contract).not.toHaveProperty('selectedCandidateIds')
  })

  it('defines finalize-fast cards as shortlist-safe only', () => {
    const card = toFinalizeFastCard(
      {
        id: 'prod-1',
        title: 'Compact airport stroller',
        source: 'Target',
        price: '$199.99',
        rating: 4.7,
        reviewCount: 342,
        description: 'Lightweight stroller for flights',
        reasons: ['Fallback reason'],
        drawbacks: ['Should not be forwarded'],
        image: 'https://example.com/stroller.jpg',
        link: 'https://example.com/stroller',
      },
      {
        fitReason: 'Best match for frequent airport use.',
      },
    )

    expect(card).toEqual({
      id: 'prod-1',
      title: 'Compact airport stroller',
      subtitle: 'Target',
      price: '$199.99',
      rating: 4.7,
      reviewCount: 342,
      description: 'Lightweight stroller for flights',
      reasons: ['AI fit: Best match for frequent airport use.'],
      image: 'https://example.com/stroller.jpg',
      link: 'https://example.com/stroller',
      badgeLabel: '',
    })
    expect(card).not.toHaveProperty('drawbacks')
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
          fitSummary: 'Fits frequent travel because the fold is compact and easy to carry.',
          tradeoffSummary: 'The price is a little higher than bulkier budget picks.',
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
          fitSummary: 'Fits frequent travel because the fold is compact and easy to carry.',
          tradeoffSummary: 'The price is a little higher than bulkier budget picks.',
        },
      ],
    })
    expect(enrichment).not.toHaveProperty('selectedCandidateIds')
  })
})
