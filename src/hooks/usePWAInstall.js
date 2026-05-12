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
  const [snapshot, setSnapshot] = useState(() => ({
    isInstalled: isRunningStandalone(),
    platform: getPlatform(),
  }))

  const refreshSnapshot = useCallback(() => {
    setSnapshot({
      isInstalled: isRunningStandalone(),
      platform: getPlatform(),
    })
  }, [])

  useEffect(() => {
    const browserWindow = getWindow()
    if (!browserWindow) return undefined

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

  const isInstalled = snapshot.isInstalled

  return {
    isInstalled,
    canInstall: Boolean(_deferredPrompt && !isInstalled),
    install,
    platform: snapshot.platform,
  }
}

export default usePWAInstall
