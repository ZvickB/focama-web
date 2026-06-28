const CONFIGURED_BACKEND_URL = import.meta.env.VITE_BACKEND_URL || ''
const DIRECT_BACKEND_URL = CONFIGURED_BACKEND_URL
const PROXY_BACKEND_URL = ''
const PROXY_PREFERENCE_KEY = 'focamai_backend_route'

function isRetryableNetworkError(error) {
  return error instanceof TypeError && error.name !== 'AbortError'
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

  async function fetchPath(path, options) {
    try {
      return await runFetch(`${getUrl()}${path}`, options)
    } catch (error) {
      if (!canUseProxyFallback() || preferProxyForSession || !isRetryableNetworkError(error)) {
        throw error
      }

      const response = await runFetch(`${PROXY_BACKEND_URL}${path}`, options)
      setProxyPreference(true)
      return response
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
