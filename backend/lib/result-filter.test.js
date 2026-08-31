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
  it('blocks explicit products and keeps sensitive products without images', () => {
    const artifacts = getFilteredSearchArtifacts(
      {
        shopping_results: [
          createShoppingResult({ product_id: 'safe', title: 'Office Chair' }),
          createShoppingResult({ product_id: 'hidden', title: 'Women’s Swimsuit', thumbnail: 'swimsuit.jpg' }),
          createShoppingResult({ product_id: 'blocked', title: 'Adult Sex Toy' }),
        ],
      },
      { productQuery: 'chair swimsuit', skipHardFilter: true, diversifyBySource: false },
    )

    expect(artifacts.candidatePool.candidates.map((item) => item.id)).not.toContain('blocked')
    expect(artifacts.candidatePool.candidates.find((item) => item.id === 'hidden')).toMatchObject({
      image: '',
      moderation: { outcome: 'hide_image' },
    })
  })

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

  it('enforces an explicit brand before the AI candidate pool and excludes reference books', () => {
    const artifacts = getFilteredSearchArtifacts(
      {
        shopping_results: [
          createShoppingResult({ product_id: 'rolex-datejust', title: 'Rolex Datejust 36 Automatic Watch', brand: 'Rolex', source: 'Amazon' }),
          createShoppingResult({ position: 2, product_id: 'rolex-submariner', title: 'Rolex Submariner Date Oystersteel Watch', brand: 'Rolex', source: 'Amazon' }),
          createShoppingResult({ position: 3, product_id: 'rolex-explorer', title: 'Rolex Explorer 40 Black Dial Watch', brand: 'Rolex', source: 'Amazon' }),
          createShoppingResult({ position: 4, product_id: 'pagani', title: 'Pagani Design PD-1662 Homage Watch', brand: 'Pagani Design', source: 'Amazon' }),
          createShoppingResult({ position: 5, product_id: 'olevs', title: 'OLEVS Luxury Automatic Watch', brand: 'OLEVS', source: 'Amazon' }),
          createShoppingResult({ position: 6, product_id: 'rolex-book', title: 'Rolex Watches: A Complete History Book', brand: 'Rolex', source: 'Amazon' }),
        ],
      },
      {
        productQuery: 'Rolex watch',
        diversifyBySource: false,
        reasonFallback: 'Returned by the Rainforest API search route',
      },
    )

    expect(artifacts.candidatePool.candidates.map((candidate) => candidate.id)).toEqual([
      'rolex-datejust',
      'rolex-submariner',
      'rolex-explorer',
    ])
  })

  it('keeps same-brand alternatives for plain-word model names while generic searches stay broad', () => {
    const payload = {
      shopping_results: [
        createShoppingResult({ product_id: 'submariner', title: 'Rolex Submariner Date Watch', brand: 'Rolex', source: 'Amazon' }),
        createShoppingResult({ position: 2, product_id: 'datejust', title: 'Rolex Datejust 36 Watch', brand: 'Rolex', source: 'Amazon' }),
        createShoppingResult({ position: 3, product_id: 'seiko', title: 'Seiko 5 Sports Automatic Watch', brand: 'Seiko', source: 'Amazon' }),
      ],
    }

    const namedModel = getFilteredSearchArtifacts(payload, {
      productQuery: 'Rolex Submariner watch',
      diversifyBySource: false,
      reasonFallback: 'Returned by the Rainforest API search route',
    })
    const generic = getFilteredSearchArtifacts(payload, {
      productQuery: 'watch',
      diversifyBySource: false,
      reasonFallback: 'Returned by the Rainforest API search route',
    })

    expect(namedModel.candidatePool.candidates.map((candidate) => candidate.id)).toEqual([
      'submariner',
      'datejust',
    ])
    expect(generic.candidatePool.candidates.map((candidate) => candidate.id)).toEqual([
      'submariner',
      'datejust',
      'seiko',
    ])
  })

  it('keeps descriptive same-brand listings when Amazon uses a product synonym', () => {
    const artifacts = getFilteredSearchArtifacts(
      {
        shopping_results: [
          createShoppingResult({
            product_id: 'classic-six-pack',
            title: "Hanes Ultimate Men's 6-Pack Best V-Neck T-Shirt",
            brand: 'Hanes',
            source: 'Amazon',
          }),
          createShoppingResult({
            position: 2,
            product_id: 'sweat-block-three-pack',
            title: "Hanes Men's Sweat Block Undershirt, White V-Neck T-Shirt, 3-Pack",
            brand: 'Hanes',
            source: 'Amazon',
          }),
          createShoppingResult({
            position: 3,
            product_id: 'jockey-six-pack',
            title: 'Jockey Classic V-Neck Undershirt, 6-Pack',
            brand: 'Jockey',
            source: 'Amazon',
          }),
        ],
      },
      {
        productQuery: 'hanes v neck undershirt',
        diversifyBySource: false,
        skipHardFilter: true,
        reasonFallback: 'Returned by the Rainforest API search route',
      },
    )

    expect(artifacts.candidatePool.candidates.map((candidate) => candidate.id)).toEqual([
      'sweat-block-three-pack',
      'classic-six-pack',
    ])
  })

  it('does not turn an ambiguous short brand-like word into a hard requirement', () => {
    const artifacts = getFilteredSearchArtifacts(
      {
        shopping_results: [
          createShoppingResult({ product_id: 'on', title: 'On Cloudrunner Running Shoes', brand: 'On', source: 'Amazon' }),
          createShoppingResult({ position: 2, product_id: 'brooks', title: 'Brooks Ghost Running Shoes', brand: 'Brooks', source: 'Amazon' }),
        ],
      },
      {
        productQuery: 'on running shoes',
        diversifyBySource: false,
        reasonFallback: 'Returned by the Rainforest API search route',
      },
    )

    expect(artifacts.candidatePool.candidates.map((candidate) => candidate.id)).toEqual(['on', 'brooks'])
  })

  it('offers a close brand spelling as an optional correction without filtering the candidate pool', () => {
    const artifacts = getFilteredSearchArtifacts(
      {
        shopping_results: [
          createShoppingResult({ product_id: 'hellmanns-real', title: "Hellmann's Real Mayonnaise", brand: "Hellmann's", source: 'Amazon' }),
          createShoppingResult({ position: 2, product_id: 'hellmanns-light', title: "Hellmann's Light Mayonnaise", brand: "Hellmann's", source: 'Amazon' }),
          createShoppingResult({ position: 3, product_id: 'dukes', title: "Duke's Real Mayonnaise", brand: "Duke's", source: 'Amazon' }),
        ],
      },
      {
        productQuery: 'hellmans mayonnaise',
        diversifyBySource: false,
        skipHardFilter: true,
        minimumScore: -1,
        reasonFallback: 'Returned by the Rainforest API search route',
      },
    )

    expect(artifacts.candidatePool.searchCorrection).toEqual({
      originalQuery: 'hellmans mayonnaise',
      suggestedQuery: "Hellmann's mayonnaise",
      source: 'brand_correction',
    })
    expect(artifacts.candidatePool.candidates.map((candidate) => candidate.id)).toContain('dukes')
  })

  it('does not offer an Apple-brand correction for apple sauce', () => {
    const artifacts = getFilteredSearchArtifacts(
      {
        shopping_results: [
          createShoppingResult({ product_id: 'apple-watch', title: 'Apple Watch Series 10', brand: 'Apple', source: 'Amazon' }),
          createShoppingResult({ position: 2, product_id: 'applesauce', title: 'Organic Apple Sauce Cups', brand: 'Happy Family', source: 'Amazon' }),
        ],
      },
      {
        productQuery: 'apple sauce',
        diversifyBySource: false,
        reasonFallback: 'Returned by the Rainforest API search route',
      },
    )

    expect(artifacts.candidatePool.searchCorrection).toBeNull()
  })

  it('corrects both the brand and product typo when one candidate proves both', () => {
    const artifacts = getFilteredSearchArtifacts(
      {
        shopping_results: [
          createShoppingResult({ product_id: 'hellmanns-real', title: "Hellmann's Real Mayonnaise", brand: "Hellmann's", source: 'Amazon' }),
        ],
      },
      {
        productQuery: 'hellmans mayonaise',
        diversifyBySource: false,
        reasonFallback: 'Returned by the Rainforest API search route',
      },
    )

    expect(artifacts.candidatePool.searchCorrection?.suggestedQuery).toBe("Hellmann's mayonnaise")
  })

  it.each([
    ['Rolex watch', [['rolex', 'Rolex Datejust Watch', 'Rolex'], ['homage', 'Pagani Design Homage Watch', 'Pagani'], ['book', 'Rolex Watch History Book', 'Rolex']], ['rolex']],
    ['Rolex Submariner watch', [['submariner', 'Rolex Submariner Watch', 'Rolex'], ['datejust', 'Rolex Datejust Watch', 'Rolex'], ['seiko', 'Seiko Automatic Watch', 'Seiko']], ['submariner', 'datejust']],
    ['Sony WH-1000XM5 headphones', [['xm5', 'Sony WH-1000XM5 Wireless Headphones', 'Sony'], ['xm4', 'Sony WH-1000XM4 Headphones', 'Sony'], ['bose', 'Bose QuietComfort Headphones', 'Bose']], ['xm5']],
    ['Canon EOS R50 camera', [['r50', 'Canon EOS R50 Mirrorless Camera', 'Canon'], ['r10', 'Canon EOS R10 Camera', 'Canon'], ['nikon', 'Nikon Z50 Camera', 'Nikon']], ['r50']],
    ['Nike running shoes', [['nike', 'Nike Pegasus Running Shoes', 'Nike'], ['adidas', 'Adidas Supernova Running Shoes', 'Adidas']], ['nike']],
    ['Dyson vacuum', [['dyson', 'Dyson V15 Vacuum Cleaner', 'Dyson'], ['shark', 'Shark Navigator Vacuum Cleaner', 'Shark']], ['dyson']],
    ['KitchenAid mixer', [['kitchenaid', 'KitchenAid Stand Mixer', 'KitchenAid'], ['cuisinart', 'Cuisinart Stand Mixer', 'Cuisinart']], ['kitchenaid']],
    ['Lego Star Wars set', [['lego-star', 'LEGO Star Wars X-Wing Set', 'LEGO'], ['lego-harry', 'LEGO Harry Potter Castle Set', 'LEGO'], ['mega-star', 'MEGA Starship Set', 'MEGA']], ['lego-star', 'lego-harry']],
    ['Apple Watch', [['apple-watch', 'Apple Watch Series 10', 'Apple'], ['garmin', 'Garmin Venu Watch', 'Garmin']], ['apple-watch']],
    ['Samsung Galaxy S24 phone', [['s24', 'Samsung Galaxy S24 Phone', 'Samsung'], ['s23', 'Samsung Galaxy S23 Phone', 'Samsung'], ['pixel', 'Google Pixel Phone', 'Google']], ['s24']],
    ['watch', [['seiko', 'Seiko 5 Watch', 'Seiko'], ['citizen', 'Citizen Eco-Drive Watch', 'Citizen']], ['seiko', 'citizen']],
    ['running shoes', [['brooks', 'Brooks Ghost Running Shoes', 'Brooks'], ['asics', 'ASICS Gel Running Shoes', 'ASICS']], ['brooks', 'asics']],
    ['on running shoes', [['on', 'On Cloudrunner Running Shoes', 'On'], ['brooks', 'Brooks Ghost Running Shoes', 'Brooks']], ['on', 'brooks']],
    ['apple pie pan', [['pan', 'Apple Pie Pan', 'Nordic Ware'], ['watch', 'Apple Watch Series 10', 'Apple']], ['pan', 'watch']],
    ['gap filler', [['filler', '3M Gap Filler Compound', '3M'], ['jacket', 'Gap Denim Jacket', 'Gap']], ['filler', 'jacket']],
    ['Rolex book', [['book', 'Rolex Watch History Book', 'Rolex'], ['watch', 'Rolex Datejust Watch', 'Rolex']], ['book', 'watch']],
    ['guide to Rolex watches', [['guide', 'Guide to Rolex Watches Book', 'Rolex'], ['watch', 'Rolex Datejust Watch', 'Rolex']], ['guide', 'watch']],
    ['on sale watches', [['on', 'On Sale Watch', 'On'], ['seiko', 'Seiko Sale Watch', 'Seiko']], ['on', 'seiko']],
    ['Amazon Kindle Paperwhite', [['paperwhite', 'Amazon Kindle Paperwhite', 'Amazon'], ['fire', 'Amazon Fire Tablet', 'Amazon'], ['kobo', 'Kobo Clara eReader', 'Kobo']], ['paperwhite', 'fire']],
    ['coffee maker', [['breville', 'Breville Coffee Maker', 'Breville'], ['keurig', 'Keurig Coffee Maker', 'Keurig']], ['breville', 'keurig']],
  ])('smoke-checks identifier filtering for %s', (productQuery, rows, expectedIds) => {
    const artifacts = getFilteredSearchArtifacts(
      {
        shopping_results: rows.map(([product_id, title, brand], index) => createShoppingResult({
          product_id,
          title,
          brand,
          source: 'Amazon',
          position: index + 1,
        })),
      },
      {
        productQuery,
        diversifyBySource: false,
        reasonFallback: 'Smoke test',
      },
    )

    expect(artifacts.candidatePool.candidates.map((candidate) => candidate.id).sort()).toEqual(expectedIds.sort())
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

  it('keeps source diversification for mixed-merchant shopping results by default', () => {
    const artifacts = getFilteredSearchArtifacts(
      {
        shopping_results: [
          createShoppingResult({ product_id: 'prod-1', title: 'iPad Cover A', source: 'Best Buy' }),
          createShoppingResult({ position: 2, product_id: 'prod-2', title: 'iPad Cover B', source: 'Best Buy' }),
          createShoppingResult({ position: 3, product_id: 'prod-3', title: 'iPad Cover C', source: 'Best Buy' }),
          createShoppingResult({ position: 4, product_id: 'prod-4', title: 'iPad Cover D', source: 'Target' }),
        ],
      },
      {
        productQuery: 'ipad cover',
        details: '',
        candidatePoolSize: 20,
        finalResultLimit: 4,
        reasonFallback: 'Returned by the live SerpApi search route',
      },
    )

    expect(artifacts.candidatePool.candidates.map((candidate) => candidate.title)).toEqual([
      'iPad Cover A',
      'iPad Cover B',
      'iPad Cover D',
    ])
  })

  it('can disable source diversification for single-marketplace Amazon result sets', () => {
    const artifacts = getFilteredSearchArtifacts(
      {
        shopping_results: [
          createShoppingResult({ product_id: 'prod-1', title: 'Stylus Pen for iPad 6th Generation', source: 'Amazon' }),
          createShoppingResult({ position: 2, product_id: 'prod-2', title: 'Metapen A8 iPad Pen', source: 'Amazon' }),
          createShoppingResult({ position: 3, product_id: 'prod-3', title: 'Apple iPad Pen USB-C', source: 'Amazon' }),
          createShoppingResult({ position: 4, product_id: 'prod-4', title: 'Apple iPad Pen Pro', source: 'Amazon' }),
        ],
      },
      {
        productQuery: 'ipad pen',
        details: '',
        candidatePoolSize: 20,
        finalResultLimit: 4,
        diversifyBySource: false,
        reasonFallback: 'Returned by the Rainforest API search route',
      },
    )

    expect(artifacts.candidatePool.candidates.map((candidate) => candidate.title)).toEqual([
      'Stylus Pen for iPad 6th Generation',
      'Metapen A8 iPad Pen',
      'Apple iPad Pen USB-C',
      'Apple iPad Pen Pro',
    ])
  })

  it('keeps scored results with zero literal token overlap when skipHardFilter is enabled', () => {
    const artifacts = getFilteredSearchArtifacts(
      {
        shopping_results: [
          createShoppingResult({
            product_id: 'prod-pencil',
            title: 'Apple Pencil',
            source: 'Amazon',
            snippet: 'Best stylus for drawing and note taking',
            reviews: 12500,
            rating: 4.8,
            extracted_price: 89.99,
            price: '$89.99',
          }),
          createShoppingResult({
            position: 2,
            product_id: 'prod-pen',
            title: 'Generic iPad Pen',
            source: 'Amazon',
            snippet: 'Budget stylus pen for iPad',
            reviews: 10,
            rating: 3.9,
            extracted_price: 19.99,
            price: '$19.99',
          }),
        ],
      },
      {
        productQuery: 'ipad pen',
        details: '',
        candidatePoolSize: 20,
        finalResultLimit: 4,
        minimumScore: -20,
        diversifyBySource: false,
        skipHardFilter: true,
        reasonFallback: 'Returned by the Rainforest API search route',
      },
    )

    expect(artifacts.candidatePool.candidates.map((candidate) => candidate.title)).toContain('Apple Pencil')
    expect(artifacts.results.map((result) => result.title)).toContain('Apple Pencil')
  })

  it('drops zero-priced products before they reach preview results or the AI candidate pool', () => {
    const artifacts = getFilteredSearchArtifacts(
      {
        shopping_results: [
          createShoppingResult({
            product_id: 'prod-zero',
            title: 'Unavailable Listing',
            source: 'Amazon',
            extracted_price: 0,
            price: '$0.00',
          }),
          createShoppingResult({
            position: 2,
            product_id: 'prod-live',
            title: 'Travel Stroller',
            source: 'Amazon',
            extracted_price: 129.99,
            price: '$129.99',
          }),
        ],
      },
      {
        productQuery: 'travel stroller',
        details: '',
        candidatePoolSize: 20,
        finalResultLimit: 4,
        diversifyBySource: false,
        skipHardFilter: true,
        reasonFallback: 'Returned by the Rainforest API search route',
      },
    )

    expect(artifacts.candidatePool.candidates.map((candidate) => candidate.id)).toEqual(['prod-live'])
    expect(artifacts.results.map((result) => result.id)).toEqual(['prod-live'])
  })

  it('drops missing-price products before they reach preview results or the AI candidate pool', () => {
    const artifacts = getFilteredSearchArtifacts(
      {
        shopping_results: [
          createShoppingResult({
            product_id: 'prod-missing',
            title: 'No Price Listing',
            source: 'Amazon',
            extracted_price: null,
            price: null,
          }),
          createShoppingResult({
            position: 2,
            product_id: 'prod-live',
            title: 'Travel Stroller',
            source: 'Amazon',
            extracted_price: 129.99,
            price: '$129.99',
          }),
        ],
      },
      {
        productQuery: 'travel stroller',
        details: '',
        candidatePoolSize: 20,
        finalResultLimit: 4,
        diversifyBySource: false,
        skipHardFilter: true,
        reasonFallback: 'Returned by the Rainforest API search route',
      },
    )

    expect(artifacts.candidatePool.candidates.map((candidate) => candidate.id)).toEqual(['prod-live'])
    expect(artifacts.results.map((result) => result.id)).toEqual(['prod-live'])
  })

  it('falls back to the first 20 deduped Serp-style results when too few items pass hard filters', () => {
    const matchingResults = Array.from({ length: 14 }, (_, index) => (
      createShoppingResult({
        position: index + 1,
        product_id: `prod-match-${index + 1}`,
        title: `iPad Cover Match ${index + 1}`,
        source: `Store ${index + 1}`,
        reviews: 500 - index,
      })
    ))
    const fallbackResult = createShoppingResult({
      position: 15,
      product_id: 'prod-fallback',
      title: 'Apple Pencil',
      source: 'Store 15',
      snippet: 'Top rated stylus with excellent pressure sensitivity',
      reviews: 12000,
      rating: 4.8,
      extracted_price: 89.99,
      price: '$89.99',
    })

    const artifacts = getFilteredSearchArtifacts(
      {
        shopping_results: [
          ...matchingResults,
          fallbackResult,
        ],
      },
      {
        productQuery: 'ipad cover',
        details: '',
        candidatePoolSize: 20,
        finalResultLimit: 20,
        hardFilterFallbackThreshold: 15,
        hardFilterFallbackPoolSize: 20,
        reasonFallback: 'Returned by the live SerpApi search route',
      },
    )

    expect(artifacts.candidatePool.candidates).toHaveLength(15)
    expect(artifacts.candidatePool.candidates.map((candidate) => candidate.title)).toContain('Apple Pencil')
    expect(artifacts.results.map((result) => result.title)).toContain('Apple Pencil')
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
            isPrime: true,
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
      isPrime: true,
      delivery: 'Free shipping',
    })
    expect(artifacts.results[0]).toEqual(expect.objectContaining({ delivery: 'Free shipping', isPrime: true }))
    expect(artifacts.candidatePool.candidates[0].matchSignals).toEqual(
      expect.objectContaining({
        titleMatches: expect.any(Number),
        supportMatches: expect.any(Number),
        detailMatches: expect.any(Number),
        hasPrimeDelivery: true,
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

  it('collapses clearly redundant same-family variants before the AI pool but keeps meaningful family differences', () => {
    const artifacts = getFilteredSearchArtifacts(
      {
        shopping_results: [
          createShoppingResult({
            position: 1,
            title: 'On Cloud 6 Running Shoe',
            product_id: 'prod-1',
            source: 'Nordstrom',
            extracted_price: 149.99,
            price: '$149.99',
            snippet: 'Lightweight running shoe for everyday wear',
          }),
          createShoppingResult({
            position: 2,
            title: 'On Cloud 6 Running Shoe',
            product_id: 'prod-2',
            source: 'REI',
            extracted_price: 151.99,
            price: '$151.99',
            snippet: 'Lightweight running shoe for everyday wear',
          }),
          createShoppingResult({
            position: 3,
            title: 'On Cloud 6 Waterproof Running Shoe',
            product_id: 'prod-3',
            source: 'Nordstrom',
            extracted_price: 179.99,
            price: '$179.99',
            snippet: 'Waterproof running shoe with lightweight feel',
          }),
          createShoppingResult({
            position: 4,
            title: 'Brooks Ghost Running Shoe',
            product_id: 'prod-4',
            source: 'Running Warehouse',
            extracted_price: 139.99,
            price: '$139.99',
            snippet: 'Neutral running shoe for everyday miles',
          }),
        ],
      },
      {
        productQuery: 'running shoes',
        details: '',
        candidatePoolSize: 20,
        finalResultLimit: 4,
        reasonFallback: 'Returned by the live SerpApi search route',
      },
    )

    expect(artifacts.candidatePool.candidates.map((candidate) => candidate.title)).toEqual([
      'On Cloud 6 Running Shoe',
      'On Cloud 6 Waterproof Running Shoe',
      'Brooks Ghost Running Shoe',
    ])
  })

  it('preserves snake_case Prime eligibility from provider rows', () => {
    const artifacts = getFilteredSearchArtifacts(
      {
        shopping_results: [
          createShoppingResult({
            product_id: 'prod-prime',
            title: 'Sony WH-1000XM5 Wireless Headphones',
            source: 'Amazon',
            price: '$299.99',
            extracted_price: 299.99,
            delivery: 'Free delivery',
            is_prime: true,
          }),
        ],
      },
      {
        productQuery: 'sony headphones',
        candidatePoolSize: 20,
        finalResultLimit: 1,
        reasonFallback: 'Returned by the live provider route',
      },
    )

    expect(artifacts.candidatePool.candidates[0]).toEqual(
      expect.objectContaining({ isPrime: true, delivery: 'Free delivery' }),
    )
    expect(artifacts.results[0]).toEqual(
      expect.objectContaining({ isPrime: true, delivery: 'Free delivery' }),
    )
  })
})
