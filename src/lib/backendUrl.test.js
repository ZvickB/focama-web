import { describe, expect, it, vi } from 'vitest'

import { createBackendTransport } from './backendUrl.js'

describe('backend transport', () => {
  function createStorage(initialValue = null) {
    const values = new Map()
    if (initialValue) values.set('focamai_backend_route', initialValue)

    return {
      getItem: vi.fn((key) => values.get(key) || null),
      removeItem: vi.fn((key) => values.delete(key)),
      setItem: vi.fn((key, value) => values.set(key, value)),
    }
  }

  it('uses the direct backend when it succeeds', async () => {
    const response = { ok: true }
    const fetchImpl = vi.fn().mockResolvedValue(response)
    const transport = createBackendTransport({
      directBackendUrl: 'https://backend.example',
      fetchImpl,
      proxyFallbackEnabled: true,
    })

    await expect(transport.fetchPath('/api/health')).resolves.toBe(response)
    expect(fetchImpl).toHaveBeenCalledWith('https://backend.example/api/health', undefined)
    expect(transport.getUrl()).toBe('https://backend.example')
  })

  it('retries a network failure through the proxy and remembers it', async () => {
    const response = { ok: true }
    const storage = createStorage()
    const fetchImpl = vi
      .fn()
      .mockRejectedValueOnce(new TypeError('Failed to fetch'))
      .mockResolvedValue(response)
    const transport = createBackendTransport({
      directBackendUrl: 'https://backend.example',
      fetchImpl,
      proxyFallbackEnabled: true,
      storage,
    })

    await expect(transport.fetchPath('/api/health')).resolves.toBe(response)
    await expect(transport.fetchPath('/api/search/refine')).resolves.toBe(response)
    expect(fetchImpl.mock.calls.map(([url]) => url)).toEqual([
      'https://backend.example/api/health',
      '/api/health',
      '/api/search/refine',
    ])
    expect(transport.getUrl()).toBe('')
    expect(storage.setItem).toHaveBeenCalledWith('focamai_backend_route', 'proxy')
  })

  it('starts with a remembered proxy and clears it after a successful direct ping', async () => {
    const response = { ok: true }
    const storage = createStorage('proxy')
    const fetchImpl = vi.fn().mockResolvedValue(response)
    const transport = createBackendTransport({
      directBackendUrl: 'https://backend.example',
      fetchImpl,
      proxyFallbackEnabled: true,
      storage,
    })

    expect(transport.getUrl()).toBe('')
    await expect(transport.probeDirect()).resolves.toBe(true)
    expect(fetchImpl.mock.calls[0][0]).toBe('https://backend.example/api/health')
    expect(transport.getUrl()).toBe('https://backend.example')
    expect(storage.removeItem).toHaveBeenCalledWith('focamai_backend_route')
  })

  it('remembers proxy mode when the direct ping has a network failure', async () => {
    const storage = createStorage()
    const fetchImpl = vi.fn().mockRejectedValue(new TypeError('Failed to fetch'))
    const transport = createBackendTransport({
      directBackendUrl: 'https://backend.example',
      fetchImpl,
      proxyFallbackEnabled: true,
      storage,
    })

    await expect(transport.probeDirect()).resolves.toBe(false)
    expect(transport.getUrl()).toBe('')
    expect(storage.setItem).toHaveBeenCalledWith('focamai_backend_route', 'proxy')
  })

  it('does not retry aborted or non-production requests', async () => {
    const abortError = new DOMException('Aborted', 'AbortError')
    const fetchImpl = vi.fn().mockRejectedValue(abortError)
    const transport = createBackendTransport({
      directBackendUrl: 'https://backend.example',
      fetchImpl,
      proxyFallbackEnabled: true,
    })

    await expect(transport.fetchPath('/api/search/finalize')).rejects.toBe(abortError)
    expect(fetchImpl).toHaveBeenCalledTimes(1)

    const networkFetch = vi.fn().mockRejectedValue(new TypeError('Failed to fetch'))
    const developmentTransport = createBackendTransport({
      directBackendUrl: 'http://127.0.0.1:8787',
      fetchImpl: networkFetch,
      proxyFallbackEnabled: false,
    })

    await expect(developmentTransport.fetchPath('/api/health')).rejects.toThrow('Failed to fetch')
    expect(networkFetch).toHaveBeenCalledTimes(1)
  })
})
