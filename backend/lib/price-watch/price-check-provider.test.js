import { describe, expect, it, vi } from 'vitest'

import { checkAmazonPricesByAsin } from './price-check-provider.js'

const response = (product) => ({ ok: true, json: async () => ({ product }) })

describe('price watch provider', () => {
  it('deduplicates ASINs and returns positive marketplace-aware prices and clickouts', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(response({
      asin: 'B002',
      link: 'https://www.amazon.ca/dp/B002',
      buybox_winner: { price: { value: 88.5, raw: 'CA$88.50' } },
    }))

    const result = await checkAmazonPricesByAsin({
      asins: [' B002 ', 'B002'],
      rainforestApiKey: 'rf-key',
      amazonDomain: 'amazon.ca',
      checkedAt: '2026-06-25T13:00:00.000Z',
      fetchImpl,
    })

    expect(fetchImpl).toHaveBeenCalledOnce()
    expect(result.get('B002')).toMatchObject({
      currency: 'CAD',
      currentPrice: 88.5,
      productUrl: 'https://www.amazon.ca/dp/B002?tag=focamai4203-20',
    })
  })

  it('keeps zero, missing, and unavailable prices non-alertable', async () => {
    const fetchImpl = vi.fn()
      .mockResolvedValueOnce(response({ asin: 'zero', price: { value: 0 } }))
      .mockResolvedValueOnce(response({ asin: 'missing' }))
      .mockResolvedValueOnce(response({ asin: 'unavailable', availability: { raw: 'Currently unavailable.' } }))

    const result = await checkAmazonPricesByAsin({
      asins: ['zero', 'missing', 'unavailable'],
      rainforestApiKey: 'rf-key',
      checkedAt: '2026-06-25T13:00:00.000Z',
      fetchImpl,
    })

    expect(result.get('zero')).toMatchObject({ currentPrice: null, unavailableReason: 'missing_price' })
    expect(result.get('missing')).toMatchObject({ currentPrice: null, unavailableReason: 'missing_price' })
    expect(result.get('unavailable')).toMatchObject({ currentPrice: null, unavailableReason: 'out_of_stock' })
  })

  it('isolates provider failures per ASIN and avoids calls when Rainforest is unconfigured', async () => {
    const fetchImpl = vi.fn()
      .mockResolvedValueOnce(response({ asin: 'good', price: { value: 42 } }))
      .mockResolvedValueOnce({ ok: false, status: 502, json: async () => ({}) })
    const partial = await checkAmazonPricesByAsin({
      asins: ['good', 'bad'],
      rainforestApiKey: 'rf-key',
      checkedAt: '2026-06-25T13:00:00.000Z',
      fetchImpl,
    })
    const noConfigFetch = vi.fn()
    const unconfigured = await checkAmazonPricesByAsin({
      asins: ['uncalled'],
      rainforestApiKey: '',
      checkedAt: '2026-06-25T13:00:00.000Z',
      fetchImpl: noConfigFetch,
    })

    expect(partial.get('good').currentPrice).toBe(42)
    expect(partial.get('bad')).toMatchObject({ currentPrice: null, unavailableReason: 'provider_error' })
    expect(unconfigured.get('uncalled')).toMatchObject({ unavailableReason: 'provider_error' })
    expect(noConfigFetch).not.toHaveBeenCalled()
  })
})
