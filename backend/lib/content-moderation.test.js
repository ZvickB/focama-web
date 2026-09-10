import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  applyProductModeration,
  beginOpenAiQueryModeration,
  isClientInQueryModerationPenaltyBox,
  MODERATION_OUTCOMES,
  moderateQueryWithOpenAI,
  moderateProduct,
  moderateProductList,
  moderateQuery,
  OPENAI_MODERATION_ENDPOINT,
  QUERY_MODERATION_PENALTY_MS,
  resetQueryModerationState,
} from './content-moderation.js'

describe('content moderation', () => {
  beforeEach(() => {
    resetQueryModerationState()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('blocks representative explicit queries, including a misspelling', () => {
    for (const query of ['sex toy', 'personal lubricant', 'K-Y jelly', 'vibrater']) {
      expect(moderateQuery(query).outcome, query).toBe(MODERATION_OUTCOMES.BLOCK)
    }
  })

  it('does not block ordinary products that share sensitive-looking words', () => {
    for (const query of ['bike lubricant', 'Kentucky travel guide', 'boxer briefs', 'shorts']) {
      expect(moderateQuery(query).outcome, query).toBe(MODERATION_OUTCOMES.ALLOW)
    }
  })

  it('hides images for the supported sensitive-apparel boundary', () => {
    for (const title of [
      'Women’s Cotton Bra',
      'Women’s Underwear',
      'Breathable Underwear',
      'Underwear for Women',
      'Women Breathable Cotton Underwear',
      'Cotton Briefs for Women',
      'Ladies Seamless Underwear',
      'One Piece Swimsuit',
      'Bikini Trimmer',
      'Women’s Shapewear Bodysuit',
      'Summer Crop Top',
    ]) {
      expect(moderateProduct({ title }).outcome, title).toBe(MODERATION_OUTCOMES.HIDE_IMAGE)
    }
  })

  it('keeps the agreed ordinary-apparel boundary visible', () => {
    for (const title of [
      'Men’s Boxer Briefs',
      'Breathable Underwear for Men',
      'Boxer Briefs',
      'Girls Cotton Briefs',
      "Girls' Panties",
      'Kids Underwear',
      'Children Underwear',
      'Toddler Training Underwear',
      'Running Shorts',
      'Tank Top',
      'Women’s Leggings',
    ]) {
      expect(moderateProduct({ title }).outcome, title).toBe(MODERATION_OUTCOMES.ALLOW)
    }
  })

  it('keeps nursing and feminine-hygiene products visible', () => {
    for (const title of ['Nursing Pads', 'Organic Cotton Tampons', 'Menstrual Cup', 'Feminine Hygiene Pads']) {
      expect(moderateProduct({ title }).outcome, title).toBe(MODERATION_OUTCOMES.ALLOW)
    }
  })

  it('clears images and keeps text for hide-image products', () => {
    const product = applyProductModeration({ product_id: 'one', title: 'Women’s Swimsuit', thumbnail: 'image.jpg' })
    expect(product).toMatchObject({ title: 'Women’s Swimsuit', thumbnail: '', moderation: { outcome: 'hide_image' } })
  })

  it('removes blocked products from lists', () => {
    const products = moderateProductList([
      { title: 'Office Chair' },
      { title: 'Adult Sex Toy' },
    ])
    expect(products.map((product) => product.title)).toEqual(['Office Chair'])
  })

  it('blocks only the agreed OpenAI sexual categories', async () => {
    const fetchImpl = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        results: [{
          flagged: true,
          categories: {
            sexual: false,
            'sexual/minors': false,
            violence: true,
            'self-harm': true,
          },
        }],
      }),
    })

    const moderation = await moderateQueryWithOpenAI('self harm recovery workbook', {
      apiKey: 'openai-key',
      fetchImpl,
    })

    expect(moderation).toMatchObject({
      outcome: MODERATION_OUTCOMES.ALLOW,
      failedOpen: false,
      categories: [],
    })
    expect(fetchImpl).toHaveBeenCalledWith(
      OPENAI_MODERATION_ENDPOINT,
      expect.objectContaining({ signal: expect.any(AbortSignal) }),
    )
  })

  it('blocks an OpenAI sexual verdict and places a known IP in the penalty box', async () => {
    const fetchImpl = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        results: [{ categories: { sexual: true, 'sexual/minors': false } }],
      }),
    })

    const firstCheck = beginOpenAiQueryModeration('coded brand name', {
      apiKey: 'openai-key',
      clientIp: '203.0.113.10',
      fetchImpl,
    })
    const moderation = await firstCheck.promise
    const secondCheck = beginOpenAiQueryModeration('office chair', {
      apiKey: 'openai-key',
      clientIp: '203.0.113.10',
      fetchImpl,
    })

    expect(firstCheck.synchronous).toBe(false)
    expect(moderation).toMatchObject({
      outcome: MODERATION_OUTCOMES.BLOCK,
      categories: ['sexual'],
      penaltyApplied: true,
    })
    expect(secondCheck.synchronous).toBe(true)
    await secondCheck.promise
  })

  it('shares an in-flight moderation request for the same IP and query', async () => {
    let resolveFetch
    const fetchImpl = vi.fn(() => new Promise((resolve) => {
      resolveFetch = resolve
    }))

    const firstCheck = beginOpenAiQueryModeration('desk lamp', {
      apiKey: 'openai-key',
      clientIp: '203.0.113.11',
      fetchImpl,
    })
    const secondCheck = beginOpenAiQueryModeration('desk lamp', {
      apiKey: 'openai-key',
      clientIp: '203.0.113.11',
      fetchImpl,
    })

    expect(firstCheck.promise).toBe(secondCheck.promise)
    expect(fetchImpl).toHaveBeenCalledTimes(1)

    resolveFetch({
      ok: true,
      json: async () => ({ results: [{ categories: { sexual: false, 'sexual/minors': false } }] }),
    })
    await firstCheck.promise
  })

  it('fails open when OpenAI times out or returns an invalid response', async () => {
    const timeoutError = Object.assign(new Error('timed out'), { name: 'TimeoutError' })
    const timedOut = await moderateQueryWithOpenAI('desk lamp', {
      apiKey: 'openai-key',
      fetchImpl: vi.fn().mockRejectedValue(timeoutError),
    })
    const invalid = await moderateQueryWithOpenAI('desk lamp', {
      apiKey: 'openai-key',
      fetchImpl: vi.fn().mockResolvedValue({ ok: true, json: async () => ({ results: [] }) }),
    })

    expect(timedOut).toMatchObject({
      outcome: MODERATION_OUTCOMES.ALLOW,
      failedOpen: true,
      failureType: 'timeout',
    })
    expect(invalid).toMatchObject({
      outcome: MODERATION_OUTCOMES.ALLOW,
      failedOpen: true,
      failureType: 'invalid_response',
    })
  })

  it('refreshes the one-hour penalty on another block and never penalizes anonymous clients', async () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-07-03T12:00:00.000Z'))
    const fetchImpl = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        results: [{ categories: { sexual: true, 'sexual/minors': false } }],
      }),
    })

    await beginOpenAiQueryModeration('coded brand one', {
      apiKey: 'openai-key',
      clientIp: '203.0.113.12',
      fetchImpl,
    }).promise
    vi.setSystemTime(Date.now() + QUERY_MODERATION_PENALTY_MS / 2)
    await beginOpenAiQueryModeration('coded brand two', {
      apiKey: 'openai-key',
      clientIp: '203.0.113.12',
      fetchImpl,
    }).promise
    const originalExpiry = Date.now() + QUERY_MODERATION_PENALTY_MS / 2
    vi.setSystemTime(originalExpiry + 1)

    expect(isClientInQueryModerationPenaltyBox('203.0.113.12')).toBe(true)

    await beginOpenAiQueryModeration('coded anonymous brand', {
      apiKey: 'openai-key',
      clientIp: 'anonymous',
      fetchImpl,
    }).promise
    expect(isClientInQueryModerationPenaltyBox('anonymous')).toBe(false)
  })
})
