import { afterEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  readCachedSearchSnapshot: vi.fn(),
}))

vi.mock('./search-pipeline.js', () => ({
  readCachedSearchSnapshot: mocks.readCachedSearchSnapshot,
}))

import { resolveDiscoveryContext } from './discovery-context.js'

describe('discovery session readiness', () => {
  afterEach(() => {
    vi.useRealTimers()
    vi.clearAllMocks()
    delete process.env.DISCOVERY_SESSION_READY_TIMEOUT_MS
  })

  it('briefly polls for a newly issued token while its background write finishes', async () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-08-27T18:00:00.000Z'))
    process.env.DISCOVERY_SESSION_READY_TIMEOUT_MS = '500'
    const token = `${Date.now().toString(36)}.test-token`
    const cachedEntry = { discoveryToken: token, candidatePool: { candidates: [{ id: 'one' }] } }
    mocks.readCachedSearchSnapshot
      .mockResolvedValueOnce({ cachedEntry: null })
      .mockResolvedValueOnce({ cachedEntry })

    const resolution = resolveDiscoveryContext('office chair', token)
    await vi.advanceTimersByTimeAsync(101)

    await expect(resolution).resolves.toEqual(expect.objectContaining({
      cachedEntry,
      isValid: true,
    }))
    expect(mocks.readCachedSearchSnapshot).toHaveBeenCalledTimes(2)
  })

  it('does not delay an invalid legacy token', async () => {
    mocks.readCachedSearchSnapshot.mockResolvedValue({ cachedEntry: null })

    await expect(resolveDiscoveryContext('office chair', 'old-token', []))
      .resolves.toEqual(expect.objectContaining({ isValid: false, statusCode: 409 }))
    expect(mocks.readCachedSearchSnapshot).toHaveBeenCalledTimes(1)
  })

  it('does not search unrelated shared scopes after a recent token readiness miss', async () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-08-27T18:00:00.000Z'))
    process.env.DISCOVERY_SESSION_READY_TIMEOUT_MS = '250'
    const token = `${Date.now().toString(36)}.missing-token`
    mocks.readCachedSearchSnapshot.mockResolvedValue({ cachedEntry: null })

    const resolution = resolveDiscoveryContext('office chair', token, ['rainforest'])
    await vi.advanceTimersByTimeAsync(251)

    await expect(resolution).resolves.toEqual(expect.objectContaining({
      isValid: false,
      statusCode: 409,
    }))
    expect(mocks.readCachedSearchSnapshot.mock.calls.length).toBeGreaterThanOrEqual(3)
    expect(mocks.readCachedSearchSnapshot).not.toHaveBeenCalledWith(
      expect.objectContaining({ scope: 'rainforest' }),
    )
  })
})
