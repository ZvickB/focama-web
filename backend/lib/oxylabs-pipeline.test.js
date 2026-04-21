import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  fetchOxylabsArtifacts,
  fetchOxylabsProductDetailsByAsin,
  OXYLABS_ENDPOINT,
} from './oxylabs-pipeline.js'

describe('oxylabs pipeline', () => {
  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn())
  })

  afterEach(() => {
    vi.unstubAllGlobals()
    vi.restoreAllMocks()
  })

  it('returns an error with null artifacts when search credentials are missing', async () => {
    const result = await fetchOxylabsArtifacts({
      productQuery: 'office chair',
      details: 'ergonomic',
      reasonFallback: 'Returned by the Rainforest API search route',
      oxylabsUsername: '',
      oxylabsPassword: '',
    })

    expect(result).toEqual({
      error: {
        error: 'Oxylabs credentials are missing.',
        statusCode: 500,
      },
      artifacts: null,
    })
    expect(fetch).not.toHaveBeenCalled()
  })

  it('returns artifacts from a valid Oxylabs amazon_search response shape', async () => {
    fetch.mockResolvedValue({
      ok: true,
      json: async () => ({
        results: [{
          content: {
            results: {
              organic: [
                {
                  asin: 'B001',
                  title: 'Ergonomic Office Chair',
                  price: 199.99,
                  rating: 4.6,
                  reviews_count: 832,
                  url_image: 'https://example.com/chair.jpg',
                  url: '/dp/B001',
                  is_prime: true,
                  pos: 1,
                },
                {
                  asin: 'B002',
                  title: 'Mesh Office Chair',
                  price: 149.99,
                  rating: 4.2,
                  reviews_count: 211,
                  url_image: 'https://example.com/chair-2.jpg',
                  url: '/dp/B002',
                  is_prime: false,
                  pos: 2,
                },
              ],
            },
          },
        }],
      }),
    })

    const result = await fetchOxylabsArtifacts({
      productQuery: 'office chair',
      details: 'ergonomic lumbar support',
      reasonFallback: 'Returned by the Rainforest API search route',
      oxylabsUsername: 'oxy-user',
      oxylabsPassword: 'oxy-pass',
    })

    expect(fetch).toHaveBeenCalledTimes(1)
    expect(fetch).toHaveBeenCalledWith(
      OXYLABS_ENDPOINT,
      expect.objectContaining({
        method: 'POST',
        headers: expect.objectContaining({
          'Content-Type': 'application/json',
          Authorization: `Basic ${Buffer.from('oxy-user:oxy-pass').toString('base64')}`,
        }),
        body: JSON.stringify({
          source: 'amazon_search',
          domain: 'com',
          query: 'office chair ergonomic lumbar support',
          parse: true,
          pages: 1,
        }),
      }),
    )
    expect(result.error).toBeNull()
    expect(result.artifacts).toEqual(
      expect.objectContaining({
        candidatePool: expect.objectContaining({
          query: 'office chair',
          details: 'ergonomic lumbar support',
          candidates: expect.arrayContaining([
            expect.objectContaining({
              id: 'B001',
              title: 'Ergonomic Office Chair',
            }),
          ]),
        }),
        results: expect.arrayContaining([
          expect.objectContaining({
            id: 'B001',
            title: 'Ergonomic Office Chair',
          }),
        ]),
      }),
    )
  })

  it('returns an empty Map when product-detail credentials are missing', async () => {
    const result = await fetchOxylabsProductDetailsByAsin({
      asins: ['B001'],
      oxylabsUsername: '',
      oxylabsPassword: '',
    })

    expect(result).toBeInstanceOf(Map)
    expect(result.size).toBe(0)
    expect(fetch).not.toHaveBeenCalled()
  })

  it('returns a populated Map with normalized product details from mocked fetch', async () => {
    fetch.mockResolvedValue({
      ok: true,
      json: async () => ({
        results: [{
          content: {
            asin: 'B001',
            bullet_points: 'One-hand fold\nCompact enough for overhead bins',
            description: 'A compact stroller built for airport travel.',
          },
        }],
      }),
    })

    const result = await fetchOxylabsProductDetailsByAsin({
      asins: ['B001', 'B001'],
      oxylabsUsername: 'oxy-user',
      oxylabsPassword: 'oxy-pass',
    })

    expect(fetch).toHaveBeenCalledTimes(1)
    expect(fetch).toHaveBeenCalledWith(
      OXYLABS_ENDPOINT,
      expect.objectContaining({
        method: 'POST',
        headers: expect.objectContaining({
          'Content-Type': 'application/json',
          Authorization: `Basic ${Buffer.from('oxy-user:oxy-pass').toString('base64')}`,
        }),
        body: JSON.stringify({
          source: 'amazon_product',
          domain: 'com',
          query: 'B001',
          parse: true,
        }),
      }),
    )
    expect(result).toBeInstanceOf(Map)
    expect(result.get('B001')).toEqual({
      feature_bullets: ['One-hand fold', 'Compact enough for overhead bins'],
      productDescription: 'A compact stroller built for airport travel.',
    })
  })
})
