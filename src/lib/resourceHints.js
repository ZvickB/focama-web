function canUseDom() {
  return typeof document !== 'undefined'
}

function canUseWindow() {
  return typeof window !== 'undefined'
}

function buildLinkSelector(rel, href) {
  return `link[rel="${rel}"][href="${href}"]`
}

export function ensureHeadLink({ rel, href, crossOrigin }) {
  if (!canUseDom() || !href) {
    return null
  }

  const existingLink = document.head.querySelector(buildLinkSelector(rel, href))
  if (existingLink) {
    return existingLink
  }

  const link = document.createElement('link')
  link.rel = rel
  link.href = href

  if (crossOrigin) {
    link.crossOrigin = crossOrigin
  }

  document.head.appendChild(link)
  return link
}

export function preconnectToUrl(url, { crossOrigin = 'anonymous' } = {}) {
  if (!url) {
    return null
  }

  let origin

  try {
    origin = new URL(url, canUseWindow() ? window.location.origin : undefined).origin
  } catch {
    return null
  }

  return ensureHeadLink({
    rel: 'preconnect',
    href: origin,
    crossOrigin,
  })
}

export function scheduleIdleTask(callback, timeout = 1500) {
  if (!canUseWindow()) {
    return () => {}
  }

  if (typeof window.requestIdleCallback === 'function') {
    const idleId = window.requestIdleCallback(callback, { timeout })
    return () => window.cancelIdleCallback?.(idleId)
  }

  const timeoutId = window.setTimeout(callback, 300)
  return () => window.clearTimeout(timeoutId)
}
