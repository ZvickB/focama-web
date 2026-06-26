import { describe, expect, it, vi } from 'vitest'

import { checkAmazonPricesByAsin } from './price-check-provider.js'

function createRainforestResponse(product) {
  return {
    ok: true,
    json: async () => ({ product }),
  }
}

describe('price watch price-check provider', () => {
  it('returns fresh positive numeric Rainforest prices by ASIN', async () => {
    const fetchImpl = vi.fn(async () => createRainforestResponse({
      asin: 'B001',
      link: 'https://www.amazon.com/dp/B001',
      price: { value: 129.99, raw: '$129.99' },
    }))

    const result = await checkAmazonPricesByAsin({
      asins: ['B001'],
      rainforestApiKey: 'rf-key',
      amazonDomain: 'amazon.com',
      checkedAt: '2026-06-25T13:00:00.000Z',
      fetchImpl,
    })

    expect(fetchImpl).toHaveBeenCalledTimes(1)
    expect(fetchImpl.mock.calls[0][0].searchParams.get('type')).toBe('product')
    expect(fetchImpl.mock.calls[0][0].searchParams.get('asin')).toBe('B001')
    expect(fetchImpl.mock.calls[0][0].searchParams.get('amazon_domain')).toBe('amazon.com')
    expect(result.get('B001')).toEqual({
      amazonDomain: 'amazon.com',
      asin: 'B001',
      checkedAt: '2026-06-25T13:00:00.000Z',
      currency: 'USD',
      currentPrice: 129.99,
      productUrl: 'https://www.amazon.com/dp/B001?tag=focamai-20',
      source: 'rainforest',
    })
  })

  it('dedupes ASINs and maps Canadian prices to CAD', async () => {
    const fetchImpl = vi.fn(async () => createRainforestResponse({
      asin: 'B002',
      link: 'https://www.amazon.ca/dp/B002',
      buybox_winner: {
        price: { value: 88.5, raw: 'CA$88.50' },
      },
    }))

    const result = await checkAmazonPricesByAsin({
      asins: [' B002 ', 'B002'],
      rainforestApiKey: 'rf-key',
      amazonDomain: 'amazon.ca',
      checkedAt: '2026-06-25T13:00:00.000Z',
      fetchImpl,
    })

    expect(fetchImpl).toHaveBeenCalledTimes(1)
    expect(result.get('B002')).toEqual(expect.objectContaining({
      amazonDomain: 'amazon.ca',
      currency: 'CAD',
      currentPrice: 88.5,
      productUrl: 'https://www.amazon.ca/dp/B002?tag=focamai4203-20',
    }))
  })

  it('marks missing or zero prices as non-alertable missing_price results', async () => {
    const fetchImpl = vi.fn()
      .mockResolvedValueOnce(createRainforestResponse({
        asin: 'B003',
        price: { value: 0, raw: '$0.00' },
      }))
      .mockResolvedValueOnce(createRainforestResponse({
        asin: 'B004',
      }))

    const result = await checkAmazonPricesByAsin({
      asins: ['B003', 'B004'],
      rainforestApiKey: 'rf-key',
      checkedAt: '2026-06-25T13:00:00.000Z',
      fetchImpl,
    })

    expect(result.get('B003')).toEqual(expect.objectContaining({
      currentPrice: null,
      unavailableReason: 'missing_price',
    }))
    expect(result.get('B004')).toEqual(expect.objectContaining({
      currentPrice: null,
      unavailableReason: 'missing_price',
    }))
  })

  it('marks unavailable product pages as out_of_stock', async () => {
    const fetchImpl = vi.fn(async () => createRainforestResponse({
      asin: 'B005',
      availability: { raw: 'Currently unavailable.' },
    }))

    const result = await checkAmazonPricesByAsin({
      asins: ['B005'],
      rainforestApiKey: 'rf-key',
      checkedAt: '2026-06-25T13:00:00.000Z',
      fetchImpl,
    })

    expect(result.get('B005')).toEqual(expect.objectContaining({
      currentPrice: null,
      unavailableReason: 'out_of_stock',
    }))
  })

  it('marks provider failures without throwing the whole batch away', async () => {
    const fetchImpl = vi.fn()
      .mockResolvedValueOnce(createRainforestResponse({
        asin: 'B006',
        price: { value: 42, raw: '$42.00' },
      }))
      .mockResolvedValueOnce({
        ok: false,
        status: 502,
        json: async () => ({}),
      })

    const result = await checkAmazonPricesByAsin({
      asins: ['B006', 'B007'],
      rainforestApiKey: 'rf-key',
      checkedAt: '2026-06-25T13:00:00.000Z',
      fetchImpl,
    })

    expect(result.get('B006')).toEqual(expect.objectContaining({
      currentPrice: 42,
    }))
    expect(result.get('B007')).toEqual(expect.objectContaining({
      currentPrice: null,
      unavailableReason: 'provider_error',
    }))
  })

  it('returns provider_error rows when Rainforest is not configured', async () => {
    const fetchImpl = vi.fn()

    const result = await checkAmazonPricesByAsin({
      asins: ['B008'],
      rainforestApiKey: '',
      checkedAt: '2026-06-25T13:00:00.000Z',
      fetchImpl,
    })

    expect(fetchImpl).not.toHaveBeenCalled()
    expect(result.get('B008')).toEqual(expect.objectContaining({
      currentPrice: null,
      unavailableReason: 'provider_error',
    }))
  })
})
