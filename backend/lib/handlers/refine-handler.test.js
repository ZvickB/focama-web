import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  beginOpenAiQueryModeration: vi.fn(),
  generateRefinementPrompt: vi.fn(),
  getEnv: vi.fn(),
  moderateQuery: vi.fn(),
}))

vi.mock('../content-moderation.js', () => ({
  beginOpenAiQueryModeration: mocks.beginOpenAiQueryModeration,
  moderateQuery: mocks.moderateQuery,
  MODERATION_OUTCOMES: { ALLOW: 'allow', HIDE_IMAGE: 'hide_image', BLOCK: 'block' },
}))

vi.mock('../refinement-assistant.js', () => ({
  generateRefinementPrompt: mocks.generateRefinementPrompt,
}))

vi.mock('../search-data.js', async (importOriginal) => ({
  ...(await importOriginal()),
  getEnv: mocks.getEnv,
}))

vi.mock('../observability.js', () => ({
  reportBackendError: vi.fn(),
}))

vi.mock('../server-helpers.js', () => ({
  logSearchFlowEvent: vi.fn(),
  nowMs: () => Date.now(),
  roundTimingDuration: (value) => value,
}))

import { getRefinementModel, handleRefinementPrompt } from './refine-handler.js'

function createDeferred() {
  let resolve
  const promise = new Promise((promiseResolve) => {
    resolve = promiseResolve
  })
  return { promise, resolve }
}

function createResponseRecorder() {
  return {
    body: '',
    headers: {},
    statusCode: 0,
    writeHead(statusCode, headers) {
      this.statusCode = statusCode
      this.headers = headers
    },
    end(body = '') {
      this.body += body
    },
  }
}

function refinementPayload() {
  return {
    prompt: 'What matters most?',
    alternatePrompt: 'What would rule an option out?',
    helperText: 'Choose one priority.',
    followUpPlaceholder: 'For example, compact size',
    provider: 'openai',
    model: 'gpt-5-mini',
  }
}

async function flushAsyncWork() {
  await new Promise((resolve) => setTimeout(resolve, 0))
}

describe('refine handler query moderation ordering', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.getEnv.mockImplementation((name) => ({
      OPENAI_API_KEY: 'openai-key',
      CLAUDE_API_KEY: 'claude-key',
    })[name] || '')
    mocks.moderateQuery.mockReturnValue({ outcome: 'allow' })
  })

  it('defaults refinement to Luna without inheriting the legacy generic model', () => {
    mocks.getEnv.mockImplementation((name) => (name === 'OPENAI_MODEL' ? 'gpt-5-mini' : ''))

    expect(getRefinementModel()).toBe('gpt-5.6-luna')
  })

  it('preserves the explicit refinement model override', () => {
    mocks.getEnv.mockImplementation((name) => (
      name === 'OPENAI_REFINEMENT_MODEL' ? 'test-refinement-model' : ''
    ))

    expect(getRefinementModel()).toBe('test-refinement-model')
  })

  it('starts refinement in parallel but withholds the response when moderation blocks', async () => {
    const moderation = createDeferred()
    const refinement = createDeferred()
    mocks.beginOpenAiQueryModeration.mockReturnValue({
      promise: moderation.promise,
      synchronous: false,
    })
    mocks.generateRefinementPrompt.mockReturnValue(refinement.promise)
    const response = createResponseRecorder()

    const handling = handleRefinementPrompt(
      new URL('http://localhost/api/search/refine?query=coded%20brand'),
      response,
      { headers: { 'x-forwarded-for': '203.0.113.20' } },
    )
    await flushAsyncWork()

    expect(mocks.generateRefinementPrompt).toHaveBeenCalledTimes(1)
    expect(response.statusCode).toBe(0)

    moderation.resolve({
      outcome: 'block',
      categories: ['sexual'],
      durationMs: 20,
      penaltyApplied: true,
    })
    await handling

    expect(response.statusCode).toBe(400)
    expect(JSON.parse(response.body).error).toContain('different product')
    refinement.resolve(refinementPayload())
    await flushAsyncWork()
  })

  it('waits for moderation before starting refinement for a penalized client', async () => {
    const moderation = createDeferred()
    mocks.beginOpenAiQueryModeration.mockReturnValue({
      promise: moderation.promise,
      synchronous: true,
    })
    mocks.generateRefinementPrompt.mockResolvedValue(refinementPayload())
    const response = createResponseRecorder()

    const handling = handleRefinementPrompt(
      new URL('http://localhost/api/search/refine?query=office%20chair'),
      response,
      { headers: { 'x-forwarded-for': '203.0.113.20' } },
    )
    await flushAsyncWork()

    expect(mocks.generateRefinementPrompt).not.toHaveBeenCalled()

    moderation.resolve({
      outcome: 'allow',
      categories: [],
      durationMs: 15,
      failedOpen: false,
    })
    await handling

    expect(mocks.generateRefinementPrompt).toHaveBeenCalledTimes(1)
    expect(response.statusCode).toBe(200)
  })
})
