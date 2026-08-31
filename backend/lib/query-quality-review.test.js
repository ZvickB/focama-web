import { describe, expect, it, vi } from 'vitest'

import { OPENAI_RESPONSES_ENDPOINT } from './ai-selector.js'
import { generateQueryQualityReview } from './query-quality-review.js'

describe('query quality review', () => {
  it('returns no suggestion for ok model output', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        usage: {
          input_tokens: 82,
          output_tokens: 24,
          total_tokens: 106,
          output_tokens_details: {
            reasoning_tokens: 6,
          },
        },
        output_text: JSON.stringify({
          classification: 'ok',
          suggested_query: '',
          confidence: 'high',
          reason: 'The returned pool matches the original shopping request.',
          should_suggest: false,
        }),
      }),
    })

    const result = await generateQueryQualityReview(
      {
        originalQuery: 'travel stroller for airplane',
        previewResultTitles: ['Compact Travel Stroller', 'Airline Friendly Stroller'],
        apiKey: 'test-key',
      },
      fetchMock,
    )

    expect(result).toEqual({
      classification: 'ok',
      suggestedQuery: '',
      confidence: 'high',
      reason: 'The returned pool matches the original shopping request.',
      shouldSuggest: false,
      usage: {
        inputTokens: 82,
        outputTokens: 24,
        totalTokens: 106,
        reasoningTokens: 6,
      },
      generatedAt: expect.any(String),
    })

    const [, request] = fetchMock.mock.calls[0]
    const parsedBody = JSON.parse(request.body)

    expect(fetchMock.mock.calls[0][0]).toBe(OPENAI_RESPONSES_ENDPOINT)
    expect(request.signal).toBeInstanceOf(AbortSignal)
    expect(parsedBody.reasoning.effort).toBe('low')
    expect(parsedBody.text.format.name).toBe('query_quality_review')
    expect(parsedBody.text.format.schema.required).toEqual([
      'classification',
      'suggested_query',
      'confidence',
      'reason',
      'should_suggest',
    ])
    expect(parsedBody.input[1].content).toContain('Do not silently correct or rewrite meaning-bearing language.')
    expect(parsedBody.input[1].content).toContain('Do not normalize, correct, or suggest searches for explicit adult products')
    expect(parsedBody.input[1].content).toContain('Query "celcius drink"')
    expect(parsedBody.input[1].content).toContain('Query "shabbos art"')
  })

  it('suggests celsius drink for a high-confidence typo response', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        output_text: JSON.stringify({
          classification: 'likely_typo',
          suggested_query: '  celsius   drink  ',
          confidence: 'high',
          reason: 'Celsius appears to be the intended energy drink brand.',
          should_suggest: true,
        }),
      }),
    })

    const result = await generateQueryQualityReview(
      {
        originalQuery: 'celcius drink',
        similarQueries: ['celsius energy drink'],
        previewResultTitles: ['Energy Drink Variety Pack', 'Sugar Free Energy Drink'],
        candidatePoolSummary: [
          { title: 'Generic Energy Drink Pack', source: 'Amazon', price: '$24.99' },
          { title: 'Sparkling Energy Beverage' },
        ],
        apiKey: 'test-key',
      },
      fetchMock,
    )

    expect(result).toMatchObject({
      classification: 'likely_typo',
      suggestedQuery: 'celsius drink',
      confidence: 'high',
      reason: 'Celsius appears to be the intended energy drink brand.',
      shouldSuggest: true,
      usage: null,
    })
  })

  it('suppresses low-confidence suggestions', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        output_text: JSON.stringify({
          classification: 'ambiguous_language',
          suggested_query: 'shabbat art',
          confidence: 'low',
          reason: 'The term could be intentional community wording.',
          should_suggest: true,
        }),
      }),
    })

    const result = await generateQueryQualityReview(
      {
        originalQuery: 'shabbos art',
        previewResultTitles: ['Shabbos Wall Art', 'Jewish Home Print'],
        apiKey: 'test-key',
      },
      fetchMock,
    )

    expect(result).toMatchObject({
      classification: 'ambiguous_language',
      suggestedQuery: '',
      confidence: 'low',
      reason: 'The term could be intentional community wording.',
      shouldSuggest: false,
    })
  })

  it('suppresses a sensitive query produced from evasive input', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        output_text: JSON.stringify({
          classification: 'likely_typo',
          suggested_query: 'sex toy',
          confidence: 'high',
          reason: 'The model normalized the spaced query.',
          should_suggest: true,
        }),
      }),
    })

    const result = await generateQueryQualityReview(
      { originalQuery: 's e x toy', apiKey: 'test-key' },
      fetchMock,
    )

    expect(result).toMatchObject({ suggestedQuery: '', shouldSuggest: false })
  })

  it('suppresses same-query suggestions after normalization', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        output_text: JSON.stringify({
          classification: 'likely_typo',
          suggested_query: '  CELCIUS   drink  ',
          confidence: 'high',
          reason: 'The model tried to suggest the same search.',
          should_suggest: true,
        }),
      }),
    })

    const result = await generateQueryQualityReview(
      {
        originalQuery: 'celcius drink',
        apiKey: 'test-key',
      },
      fetchMock,
    )

    expect(result).toMatchObject({
      classification: 'likely_typo',
      suggestedQuery: '',
      confidence: 'high',
      shouldSuggest: false,
    })
  })

  it('clamps long suggested queries and reasons', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        output_text: JSON.stringify({
          classification: 'weak_pool',
          suggested_query: `celsius drink ${'extra '.repeat(40)}`,
          confidence: 'high',
          reason: `The returned products miss the likely target brand. ${'detail '.repeat(40)}`,
          should_suggest: true,
        }),
      }),
    })

    const result = await generateQueryQualityReview(
      {
        originalQuery: 'celcius drink',
        apiKey: 'test-key',
      },
      fetchMock,
    )

    expect(result.shouldSuggest).toBe(true)
    expect(result.suggestedQuery.length).toBeLessThanOrEqual(100)
    expect(result.reason.length).toBeLessThanOrEqual(180)
    expect(result.suggestedQuery).toMatch(/^celsius drink extra/)
  })

  it('treats malformed model output as a quiet no-op', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        output_text: '{not valid json',
      }),
    })

    const result = await generateQueryQualityReview(
      {
        originalQuery: 'celcius drink',
        apiKey: 'test-key',
      },
      fetchMock,
    )

    expect(result).toMatchObject({
      classification: 'ok',
      suggestedQuery: '',
      confidence: 'low',
      reason: '',
      shouldSuggest: false,
      usage: null,
    })
  })

  it('treats no-output model responses as a quiet no-op', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        output_text: '   ',
        output: [
          {
            content: [
              { text: '   ' },
            ],
          },
        ],
      }),
    })

    const result = await generateQueryQualityReview(
      {
        originalQuery: 'celcius drink',
        apiKey: 'test-key',
      },
      fetchMock,
    )

    expect(result).toMatchObject({
      classification: 'ok',
      suggestedQuery: '',
      confidence: 'low',
      shouldSuggest: false,
    })
  })

  it('wraps fetch failures with external request metadata', async () => {
    const cause = new Error('Headers Timeout Error')
    cause.name = 'HeadersTimeoutError'
    cause.code = 'UND_ERR_HEADERS_TIMEOUT'
    const fetchError = new TypeError('fetch failed', { cause })
    const fetchMock = vi.fn().mockRejectedValue(fetchError)

    await expect(generateQueryQualityReview(
      {
        originalQuery: 'replacement parts for step 2 whisper cruiser rider',
        apiKey: 'test-key',
      },
      fetchMock,
    )).rejects.toMatchObject({
      name: 'ExternalRequestError',
      externalServiceName: 'OpenAI Responses API',
      externalUrl: OPENAI_RESPONSES_ENDPOINT,
      errorName: 'TypeError',
      errorMessage: 'fetch failed',
      errorCauseName: 'HeadersTimeoutError',
      errorCauseMessage: 'Headers Timeout Error',
      errorCode: 'UND_ERR_HEADERS_TIMEOUT',
      durationMs: expect.any(Number),
    })
  })
})
