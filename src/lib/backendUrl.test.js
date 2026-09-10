import { describe, expect, it, vi } from 'vitest'

import { createBackendTransport } from './backendUrl.js'

function storage(initialValue = null) {
  const values = new Map(initialValue ? [['focamai_backend_route', initialValue]] : [])
  return {
    getItem: vi.fn((key) => values.get(key) || null),
    removeItem: vi.fn((key) => values.delete(key)),
    setItem: vi.fn((key, value) => values.set(key, value)),
  }
}

function transport(fetchImpl, extra = {}) {
  return createBackendTransport({
    directBackendUrl: 'https://backend.example',
    fetchImpl,
    proxyFallbackEnabled: true,
    ...extra,
  })
}

describe('backend transport recovery', () => {
  it('uses the direct backend once when it is healthy', async () => {
    const response = { ok: true }
    const fetchImpl = vi.fn().mockResolvedValue(response)

    await expect(transport(fetchImpl).fetchPath('/api/health')).resolves.toBe(response)
    expect(fetchImpl).toHaveBeenCalledOnce()
    expect(fetchImpl).toHaveBeenCalledWith('https://backend.example/api/health', undefined)
  })

  it('falls back to the proxy after a network failure and remembers the healthy route', async () => {
    const routeStorage = storage()
    const fetchImpl = vi.fn()
      .mockRejectedValueOnce(new TypeError('Failed to fetch'))
      .mockResolvedValue({ ok: true })
    const backend = transport(fetchImpl, { storage: routeStorage })

    await backend.fetchPath('/api/health')
    await backend.fetchPath('/api/search/refine')

    expect(fetchImpl.mock.calls.map(([url]) => url)).toEqual([
      'https://backend.example/api/health',
      '/api/health',
      '/api/search/refine',
    ])
    expect(routeStorage.setItem).toHaveBeenCalledWith('focamai_backend_route', 'proxy')
  })

  it('retries transient reads once but never duplicates a failed write', async () => {
    const readFetch = vi.fn()
      .mockRejectedValueOnce(new TypeError('direct failed'))
      .mockRejectedValueOnce(new TypeError('proxy failed'))
      .mockResolvedValueOnce({ ok: true })
    await transport(readFetch).fetchPath('/api/search/rainforest-discover')
    expect(readFetch).toHaveBeenCalledTimes(3)

    const writeFetch = vi.fn()
      .mockRejectedValueOnce(new TypeError('direct failed'))
      .mockRejectedValueOnce(new TypeError('proxy failed'))
    await expect(transport(writeFetch).fetchPath('/api/search/finalize', { method: 'POST' }))
      .rejects.toThrow('proxy failed')
    expect(writeFetch).toHaveBeenCalledTimes(2)
  })

  it('routes a transient direct deployment response through the proxy and retries it once', async () => {
    vi.useFakeTimers()
    const fetchImpl = vi.fn()
      .mockResolvedValueOnce({ ok: false, status: 503 })
      .mockResolvedValueOnce({ ok: false, status: 502 })
      .mockResolvedValueOnce({ ok: true, status: 200 })
    const backend = transport(fetchImpl)

    const request = backend.fetchPath('/api/health')
    await vi.runAllTimersAsync()

    await expect(request).resolves.toMatchObject({ ok: true, status: 200 })
    expect(fetchImpl.mock.calls.map(([url]) => url)).toEqual([
      'https://backend.example/api/health',
      '/api/health',
      '/api/health',
    ])
    vi.useRealTimers()
  })

  it('does not retry a transient deployment response for a write', async () => {
    const response = { ok: false, status: 503 }
    const fetchImpl = vi.fn().mockResolvedValue(response)

    await expect(transport(fetchImpl).fetchPath('/api/search/finalize', { method: 'POST' }))
      .resolves.toBe(response)
    expect(fetchImpl).toHaveBeenCalledOnce()
  })

  it('does not retry aborted requests', async () => {
    const abortError = new DOMException('Aborted', 'AbortError')
    const fetchImpl = vi.fn().mockRejectedValue(abortError)

    await expect(transport(fetchImpl).fetchPath('/api/search/finalize')).rejects.toBe(abortError)
    expect(fetchImpl).toHaveBeenCalledOnce()
  })
})
