// Production normally receives this through Vercel. Keep the deployed Render
// origin as a fallback so a missing build-time variable does not silently
// disable the direct route and its same-origin retry.
const CONFIGURED_BACKEND_URL = import.meta.env.VITE_BACKEND_URL || 'https://focama-web.onrender.com'
const DIRECT_BACKEND_URL = CONFIGURED_BACKEND_URL
const PROXY_BACKEND_URL = ''
const PROXY_PREFERENCE_KEY = 'focamai_backend_route'

function isRetryableNetworkError(error) {
  return error instanceof TypeError && error.name !== 'AbortError'
}

function canRetryRequest(options) {
  const method = String(options?.method || 'GET').toUpperCase()
  return method === 'GET' || method === 'HEAD'
}

export function createBackendTransport({
  directBackendUrl = '',
  fetchImpl,
  proxyFallbackEnabled = false,
  storage,
} = {}) {
  const runFetch = fetchImpl || ((...args) => fetch(...args))
  const routeStorage = storage || (() => {
    try {
      return window.localStorage
    } catch {
      return null
    }
  })()
  let preferProxyForSession = routeStorage?.getItem(PROXY_PREFERENCE_KEY) === 'proxy'

  function canUseProxyFallback() {
    return proxyFallbackEnabled && Boolean(directBackendUrl)
  }

  function getUrl() {
    return preferProxyForSession && canUseProxyFallback() ? PROXY_BACKEND_URL : directBackendUrl
  }

  function setProxyPreference(shouldPreferProxy) {
    preferProxyForSession = shouldPreferProxy

    try {
      if (shouldPreferProxy) {
        routeStorage?.setItem(PROXY_PREFERENCE_KEY, 'proxy')
      } else {
        routeStorage?.removeItem(PROXY_PREFERENCE_KEY)
      }
    } catch {
      // The in-memory preference still works when browser storage is unavailable.
    }
  }

  async function retryReadRequest(url, options, error) {
    if (!proxyFallbackEnabled || !canRetryRequest(options) || !isRetryableNetworkError(error)) {
      throw error
    }

    return runFetch(url, options)
  }

  async function fetchPath(path, options) {
    const requestUrl = `${getUrl()}${path}`

    try {
      return await runFetch(requestUrl, options)
    } catch (error) {
      if (!canUseProxyFallback() || preferProxyForSession || !isRetryableNetworkError(error)) {
        return retryReadRequest(requestUrl, options, error)
      }

      const proxyUrl = `${PROXY_BACKEND_URL}${path}`

      try {
        const response = await runFetch(proxyUrl, options)
        setProxyPreference(true)
        return response
      } catch (proxyError) {
        return retryReadRequest(proxyUrl, options, proxyError)
      }
    }
  }

  async function probeDirect() {
    if (!canUseProxyFallback()) {
      return true
    }

    try {
      await runFetch(`${directBackendUrl}/api/health`, {
        cache: 'no-store',
        signal: AbortSignal.timeout(8000),
      })
      setProxyPreference(false)
      return true
    } catch (error) {
      if (isRetryableNetworkError(error)) {
        setProxyPreference(true)
      }
      return false
    }
  }

  return { fetchPath, getUrl, probeDirect }
}

const backendTransport = createBackendTransport({
  directBackendUrl: DIRECT_BACKEND_URL,
  proxyFallbackEnabled: import.meta.env.PROD,
})

export const fetchBackend = backendTransport.fetchPath
export const getBackendUrl = backendTransport.getUrl
export const probeDirectBackend = backendTransport.probeDirect
