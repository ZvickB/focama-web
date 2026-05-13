import { useCallback, useEffect, useState } from 'react'

let _deferredPrompt = null

function getWindow() {
  return typeof window === 'undefined' ? null : window
}

function getNavigator() {
  return typeof navigator === 'undefined' ? null : navigator
}

function isRunningStandalone() {
  const browserWindow = getWindow()
  const browserNavigator = getNavigator()

  return Boolean(
    browserWindow?.matchMedia?.('(display-mode: standalone)').matches ||
      browserNavigator?.standalone === true,
  )
}

function getPlatform() {
  const userAgent = getNavigator()?.userAgent || ''

  if (/iphone|ipad|ipod/i.test(userAgent)) return 'ios'
  if (/android/i.test(userAgent)) return 'android'
  return 'other'
}

if (typeof window !== 'undefined') {
  window.addEventListener('beforeinstallprompt', (event) => {
    event.preventDefault()
    _deferredPrompt = event
    window.dispatchEvent(new Event('pwa-install-available'))
  })

  window.addEventListener('appinstalled', () => {
    _deferredPrompt = null
    window.dispatchEvent(new Event('pwa-install-done'))
  })
}

export function usePWAInstall() {
  // Start null so we don't call matchMedia synchronously during first render.
  // We treat unknown-state as "installed" so the install button stays hidden
  // until useEffect confirms otherwise — no flash, no first-paint cost.
  const [snapshot, setSnapshot] = useState(null)

  const refreshSnapshot = useCallback(() => {
    setSnapshot({
      isInstalled: isRunningStandalone(),
      platform: getPlatform(),
    })
  }, [])

  useEffect(() => {
    const browserWindow = getWindow()
    if (!browserWindow) return undefined

    // Initialize after mount — keeps matchMedia off the first-render critical path.
    refreshSnapshot()

    const standaloneQuery = browserWindow.matchMedia?.('(display-mode: standalone)')

    browserWindow.addEventListener('pwa-install-available', refreshSnapshot)
    browserWindow.addEventListener('pwa-install-done', refreshSnapshot)
    standaloneQuery?.addEventListener?.('change', refreshSnapshot)

    return () => {
      browserWindow.removeEventListener('pwa-install-available', refreshSnapshot)
      browserWindow.removeEventListener('pwa-install-done', refreshSnapshot)
      standaloneQuery?.removeEventListener?.('change', refreshSnapshot)
    }
  }, [refreshSnapshot])

  const install = useCallback(async () => {
    if (!_deferredPrompt || isRunningStandalone()) return null

    const promptEvent = _deferredPrompt
    await promptEvent.prompt()
    const choice = await promptEvent.userChoice

    _deferredPrompt = null
    refreshSnapshot()

    return choice
  }, [refreshSnapshot])

  // Default to "installed" (true) while snapshot is null so the install button
  // stays hidden until we know for sure the app isn't already installed.
  const isInstalled = snapshot?.isInstalled ?? true

  return {
    isInstalled,
    canInstall: Boolean(_deferredPrompt && !isInstalled),
    install,
    platform: snapshot?.platform ?? 'other',
  }
}

export default usePWAInstall
