import { describe, expect, it, vi } from 'vitest'

import { resolveFinalizeRequestContext } from './finalize-context.js'

const validDiscoveryContext = {
  amazonDomain: '',
  discoveryToken: 'token-1',
  isValid: true,
  normalizedQuery: 'travel stroller',
}

describe('resolveFinalizeRequestContext', () => {
  it('stops before storage lookup when request validation fails', async () => {
    const resolveDiscoveryContext = vi.fn()

    const result = await resolveFinalizeRequestContext({
      body: {},
      resolveCandidatePool: vi.fn(),
      resolveDiscoveryContext,
      sanitizeDiscoveryContext: () => ({ error: 'Enter a product topic to get started.', isValid: false }),
    })

    expect(result).toEqual({
      discoveryContext: { error: 'Enter a product topic to get started.', isValid: false },
      isValid: false,
      reason: 'invalid_request',
    })
    expect(resolveDiscoveryContext).not.toHaveBeenCalled()
  })

  it('loads the default guided and Rainforest scopes, then returns the validated pool', async () => {
    const cachedEntry = { candidatePool: { candidates: [{ id: 'one' }] } }
    const resolveDiscoveryContext = vi.fn().mockResolvedValue({
      cachedEntry,
      discoveryScope: 'guided_discovery_session:token-1',
      isValid: true,
    })
    const resolveCandidatePool = vi.fn().mockReturnValue({
      candidatePool: { candidates: [{ id: 'one', title: 'Travel stroller' }] },
      isValid: true,
    })

    const result = await resolveFinalizeRequestContext({
      body: { query: 'travel stroller' },
      resolveCandidatePool,
      resolveDiscoveryContext,
      sanitizeDiscoveryContext: () => validDiscoveryContext,
    })

    expect(resolveDiscoveryContext).toHaveBeenCalledWith(
      'travel stroller',
      'token-1',
      ['guided_discovery', 'rainforest_discovery:v3'],
    )
    expect(resolveCandidatePool).toHaveBeenCalledWith(cachedEntry)
    expect(result).toEqual(expect.objectContaining({
      candidatePool: { candidates: [{ id: 'one', title: 'Travel stroller' }] },
      discoveryContext: validDiscoveryContext,
      isValid: true,
    }))
  })

  it('returns the candidate-pool failure without starting selection', async () => {
    const resolveCandidatePool = vi.fn().mockReturnValue({
      error: 'The cached guided discovery data was invalid. Please start the search again.',
      isValid: false,
      statusCode: 500,
    })

    const result = await resolveFinalizeRequestContext({
      body: { query: 'travel stroller' },
      resolveCandidatePool,
      resolveDiscoveryContext: vi.fn().mockResolvedValue({
        cachedEntry: { candidatePool: { candidates: [{ id: 'one' }] } },
        isValid: true,
      }),
      sanitizeDiscoveryContext: () => validDiscoveryContext,
    })

    expect(result).toMatchObject({
      isValid: false,
      reason: 'invalid_candidate_pool',
      resolvedCandidatePool: expect.objectContaining({ statusCode: 500 }),
    })
  })
})
