const RATE_LIMIT_STORE = new Map()

export const DEFAULT_RATE_LIMIT_CONFIG = {
  limit: 5,
  windowMs: 60_000,
}

function toKey(ipAddress) {
  return ipAddress?.trim() || 'anonymous'
}

export function getClientIpAddress(headers = {}) {
  const forwardedFor = headers['x-forwarded-for'] || headers['X-Forwarded-For']

  if (typeof forwardedFor === 'string' && forwardedFor.trim()) {
    return forwardedFor.split(',')[0].trim()
  }

  const realIp = headers['x-real-ip'] || headers['X-Real-Ip']

  if (typeof realIp === 'string' && realIp.trim()) {
    return realIp.trim()
  }

  return 'anonymous'
}

export function takeRateLimitToken(ipAddress, { limit, windowMs } = DEFAULT_RATE_LIMIT_CONFIG) {
  const now = Date.now()
  const key = toKey(ipAddress)
  const existingEntry = RATE_LIMIT_STORE.get(key)

  if (!existingEntry || existingEntry.resetAt <= now) {
    RATE_LIMIT_STORE.set(key, {
      count: 1,
      resetAt: now + windowMs,
    })

    return {
      allowed: true,
      remaining: Math.max(limit - 1, 0),
      resetAt: now + windowMs,
    }
  }

  if (existingEntry.count >= limit) {
    return {
      allowed: false,
      remaining: 0,
      resetAt: existingEntry.resetAt,
    }
  }

  existingEntry.count += 1
  RATE_LIMIT_STORE.set(key, existingEntry)

  return {
    allowed: true,
    remaining: Math.max(limit - existingEntry.count, 0),
    resetAt: existingEntry.resetAt,
  }
}

export function resetRateLimitStore() {
  RATE_LIMIT_STORE.clear()
}
