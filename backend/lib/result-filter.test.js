import { describe, expect, it } from 'vitest'

import {
  DEFAULT_FILTER_CONFIG,
  getFilteredNormalizedResults,
  getFilteredSearchArtifacts,
  getSearchState,
} from './result-filter.js'

function createShoppingResult(overrides = {}) {
  return {
    position: 1,
    title: 'Speck Balance Folio Case for Apple iPad 10.9 2022',
    product_id: 'prod-1',
    source: 'Best Buy',
    price: '$17.99',
    extracted_price: 17.99,
    rating: 4.7,
    reviews: 2200,
    snippet: 'Good protection',
    thumbnail: 'https://example.com/ipad-case.jpg',
    product_link: 'https://example.com/ipad-case',
    ...overrides,
  }
}

describe('result filter', () => {
  it('keeps strong relevant results and removes obvious off-topic items', () => {
    const results = getFilteredNormalizedResults(
      {
        search_information: {
          shopping_results_state: 'Results for exact spelling',
        },
        shopping_results: [
          createShoppingResult(),
          createShoppingResult({
            position: 2,
            product_id: 'prod-2',
            title: 'Apple Smart Folio for iPad',
            source: 'Target',
            reviews: 227,
          }),
          createShoppingResult({
            position: 3,
            product_id: 'prod-3',
            title: 'Wireless Earbuds with Charging Case',
            source: 'Best Buy',
            snippet: 'Noise cancelling earbuds',
          }),
        ],
      },
      {
        productQuery: 'ipad cover',
        details: '',
        finalResultLimit: 6,
        reasonFallback: 'Returned by the live SerpApi search route',
      },
    )

    expect(results).toHaveLength(2)
    expect(results.map((item) => item.title)).toEqual([
      'Speck Balance Folio Case for Apple iPad 10.9 2022',
      'Apple Smart Folio for iPad',
    ])
  })

  it('removes duplicate and near-duplicate items', () => {
    const results = getFilteredNormalizedResults(
      {
        shopping_results: [
          createShoppingResult(),
          createShoppingResult({
            position: 2,
            product_id: 'prod-1',
            source: 'Target',
          }),
          createShoppingResult({
            position: 3,
            product_id: 'prod-3',
            title: 'Speck Balance Folio Protective Cover for Apple iPad 10.9 2022',
            source: 'Walmart',
          }),
          createShoppingResult({
            position: 4,
            product_id: 'prod-4',
            title: 'ProCase iPad 11 Hard Shell Case',
            source: 'ProCase',
            reviews: 20,
          }),
        ],
      },
      {
        productQuery: 'ipad cover',
        details: '',
        finalResultLimit: 6,
        reasonFallback: 'Returned by the live SerpApi search route',
      },
    )

    expect(results).toHaveLength(2)
    expect(results.some((item) => item.title.includes('Speck Balance Folio'))).toBe(true)
    expect(results.some((item) => item.title === 'ProCase iPad 11 Hard Shell Case')).toBe(true)
  })

  it('exposes the search state for possible confidence handling', () => {
    expect(
      getSearchState({
        search_information: {
          shopping_results_state: 'Results for exact spelling',
        },
      }),
    ).toBe('Results for exact spelling')
  })

  it('uses a configurable candidate pool size without changing the filter logic', () => {
    const results = getFilteredNormalizedResults(
      {
        shopping_results: [
          createShoppingResult(),
          createShoppingResult({
            position: 2,
            product_id: 'prod-2',
            title: 'Apple Smart Folio for iPad',
            source: 'Target',
            reviews: 227,
          }),
          createShoppingResult({
            position: 3,
            product_id: 'prod-3',
            title: 'ProCase iPad 11 Hard Shell Case',
            source: 'ProCase',
            reviews: 20,
          }),
        ],
      },
      {
        productQuery: 'ipad cover',
        details: '',
        candidatePoolSize: 20,
        finalResultLimit: 2,
        minimumScore: DEFAULT_FILTER_CONFIG.minimumScore,
        reasonFallback: 'Returned by the live SerpApi search route',
      },
    )

    expect(results).toHaveLength(2)
  })

  it('exposes an AI-friendly candidate pool alongside the final UI results', () => {
    const artifacts = getFilteredSearchArtifacts(
      {
        search_information: {
          shopping_results_state: 'Results for exact spelling',
        },
        related_searches: ['rugged ipad case'],
        shopping_results: [
          createShoppingResult(),
          createShoppingResult({
            position: 2,
            product_id: 'prod-2',
            title: 'Apple Smart Folio for iPad',
            source: 'Target',
            reviews: 227,
            delivery: 'Free shipping',
            tag: 'Best seller',
            multiple_sources: true,
            extensions: ['Slim design'],
          }),
        ],
      },
      {
        productQuery: 'ipad cover',
        details: 'for school and travel',
        candidatePoolSize: 20,
        finalResultLimit: 1,
        reasonFallback: 'Returned by the live SerpApi search route',
      },
    )

    expect(artifacts.results).toHaveLength(1)
    expect(artifacts.candidatePool.query).toBe('ipad cover')
    expect(artifacts.candidatePool.details).toBe('for school and travel')
    expect(artifacts.candidatePool.similarQueries).toEqual(['rugged ipad case'])
    expect(artifacts.candidatePool.candidates).toHaveLength(2)
    expect(artifacts.candidatePool.candidates.map((candidate) => candidate.id)).toEqual(['prod-2', 'prod-1'])
    expect(artifacts.candidatePool.candidates[0]).toMatchObject({
      id: expect.any(String),
      title: expect.any(String),
      source: expect.any(String),
      score: expect.any(Number),
    })
    expect(artifacts.candidatePool.candidates[0].matchSignals).toEqual(
      expect.objectContaining({
        titleMatches: expect.any(Number),
        supportMatches: expect.any(Number),
        detailMatches: expect.any(Number),
      }),
    )
    expect(artifacts.candidatePool.candidates[0]).toEqual(
      expect.objectContaining({
        attributes: expect.any(Array),
        duplicateFamilyKey: expect.any(String),
        trustSignals: expect.objectContaining({
          score: expect.any(Number),
          ratingBand: expect.any(String),
          reviewBand: expect.any(String),
        }),
        variantTokens: expect.any(Array),
      }),
    )
  })

  it('groups duplicate-family metadata and variant tokens for near-duplicate products', () => {
    const artifacts = getFilteredSearchArtifacts(
      {
        shopping_results: [
          createShoppingResult({
            title: 'On Cloud 6 Waterproof Running Shoe',
            product_id: 'prod-1',
            source: 'Nordstrom',
            snippet: 'Waterproof running shoe with lightweight feel',
          }),
          createShoppingResult({
            position: 2,
            title: 'On Cloud 6 Running Shoe',
            product_id: 'prod-2',
            source: 'REI',
            snippet: 'Lightweight running shoe for everyday wear',
          }),
        ],
      },
      {
        productQuery: 'mens on cloud dress shoes',
        details: '',
        candidatePoolSize: 20,
        finalResultLimit: 2,
        reasonFallback: 'Returned by the live SerpApi search route',
      },
    )

    expect(artifacts.candidatePool.candidates).toHaveLength(2)
    expect(artifacts.candidatePool.candidates[0].duplicateFamilyKey).toBe(
      artifacts.candidatePool.candidates[1].duplicateFamilyKey,
    )
    expect(artifacts.candidatePool.candidates[0].variantTokens).toContain('waterproof')
  })
})
