import { createHash } from 'node:crypto'
import { createClient } from '@supabase/supabase-js'
import { getEnv } from './search-data.js'

const RATE_LIMIT_STORE = new Map()
const RATE_LIMIT_EVENTS_TABLE = 'rate_limit_events'
const SUPABASE_RATE_LIMIT_WARNING_INTERVAL_MS = 60_000

let supabaseRateLimitClient = null
let lastSupabaseRateLimitWarningAt = 0

export const DEFAULT_RATE_LIMIT_CONFIG = {
  limit: 15,
  windowMs: 10_000,
}

function toKey(ipAddress) {
  return ipAddress?.trim() || 'anonymous'
}

function getSupabaseConfig() {
  const url = getEnv('SUPABASE_URL')?.trim() || ''
  const secretKey = getEnv('SUPABASE_SECRET_KEY')?.trim() || ''
  const serviceRoleKey = getEnv('SUPABASE_SERVICE_ROLE_KEY')?.trim() || ''
  const serverKey = secretKey || serviceRoleKey

  return {
    serverKey,
    url,
  }
}

function getRateLimitStorageMode() {
  const configuredMode = (getEnv('RATE_LIMIT_STORAGE') || '').trim().toLowerCase()

  if (configuredMode === 'memory' || configuredMode === 'supabase') {
    return configuredMode
  }

  if (process.env.NODE_ENV === 'test') {
    return 'memory'
  }

  return 'auto'
}

function getSupabaseRateLimitClient() {
  if (supabaseRateLimitClient) {
    return supabaseRateLimitClient
  }

  const { serverKey, url } = getSupabaseConfig()

  if (!url || !serverKey) {
    return null
  }

  supabaseRateLimitClient = createClient(url, serverKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  })

  return supabaseRateLimitClient
}

function shouldUseSupabaseRateLimit() {
  const storageMode = getRateLimitStorageMode()

  if (storageMode === 'memory') {
    return false
  }

  if (storageMode === 'supabase') {
    return true
  }

  const { serverKey, url } = getSupabaseConfig()
  return Boolean(url && serverKey)
}

function createRateLimitKey(ipAddress) {
  const normalizedIpAddress = toKey(ipAddress)
  const salt = getEnv('RATE_LIMIT_HASH_SALT') || getSupabaseConfig().serverKey || 'focamai-rate-limit'

  return createHash('sha256')
    .update(`${salt}:${normalizedIpAddress}`)
    .digest('hex')
}

function warnSupabaseRateLimitFallback(error) {
  const now = Date.now()

  if (now - lastSupabaseRateLimitWarningAt < SUPABASE_RATE_LIMIT_WARNING_INTERVAL_MS) {
    return
  }

  lastSupabaseRateLimitWarningAt = now
  const message = error instanceof Error ? error.message : 'Unknown Supabase rate-limit error'
  console.warn(`[rate-limit] Supabase limiter unavailable; using process-local fallback: ${message}`)
}

export function getCountryCode(headers = {}) {
  const country = headers['x-vercel-ip-country'] || headers['X-Vercel-Ip-Country']
  if (typeof country === 'string' && /^[A-Z]{2}$/.test(country.trim())) {
    return country.trim()
  }
  return 'US'
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

function takeMemoryRateLimitToken(ipAddress, { limit, windowMs } = DEFAULT_RATE_LIMIT_CONFIG) {
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

async function takeSupabaseRateLimitToken(ipAddress, { limit, windowMs } = DEFAULT_RATE_LIMIT_CONFIG) {
  const supabase = getSupabaseRateLimitClient()

  if (!supabase) {
    throw new Error('Supabase is not configured for rate limiting.')
  }

  const now = Date.now()
  const createdAt = new Date(now).toISOString()
  const windowStart = new Date(now - windowMs).toISOString()
  const rateKey = createRateLimitKey(ipAddress)

  const { error: deleteError } = await supabase
    .from(RATE_LIMIT_EVENTS_TABLE)
    .delete()
    .eq('rate_key', rateKey)
    .lt('created_at', windowStart)

  if (deleteError) {
    throw deleteError
  }

  const { error: insertError } = await supabase.from(RATE_LIMIT_EVENTS_TABLE).insert({
    created_at: createdAt,
    rate_key: rateKey,
  })

  if (insertError) {
    throw insertError
  }

  const { count, data, error: countError } = await supabase
    .from(RATE_LIMIT_EVENTS_TABLE)
    .select('created_at', { count: 'exact' })
    .eq('rate_key', rateKey)
    .gte('created_at', windowStart)
    .order('created_at', { ascending: true })
    .limit(1)

  if (countError) {
    throw countError
  }

  const eventCount = Number.isFinite(count) ? count : 1
  const oldestEventMs = Array.isArray(data) && data[0]?.created_at
    ? new Date(data[0].created_at).getTime()
    : Number.NaN
  const resetAt = Number.isFinite(oldestEventMs) ? oldestEventMs + windowMs : now + windowMs

  return {
    allowed: eventCount <= limit,
    remaining: Math.max(limit - eventCount, 0),
    resetAt,
  }
}

export async function takeRateLimitToken(ipAddress, config = DEFAULT_RATE_LIMIT_CONFIG) {
  if (shouldUseSupabaseRateLimit()) {
    try {
      return await takeSupabaseRateLimitToken(ipAddress, config)
    } catch (error) {
      warnSupabaseRateLimitFallback(error)
      if (config?.failClosed === true) {
        return {
          allowed: false,
          remaining: 0,
          resetAt: Date.now() + (config?.windowMs || DEFAULT_RATE_LIMIT_CONFIG.windowMs),
          reason: 'persistent_rate_limit_unavailable',
        }
      }
    }
  }

  return takeMemoryRateLimitToken(ipAddress, config)
}

export function resetRateLimitStore() {
  RATE_LIMIT_STORE.clear()
  supabaseRateLimitClient = null
  lastSupabaseRateLimitWarningAt = 0
}
