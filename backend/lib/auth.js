import { getSupabaseAdminClient, isSupabaseConfigured } from './storage/supabase-client.js'

function clean(value) {
  return String(value || '').trim()
}

function isTruthyFlag(value) {
  if (value === true) return true
  if (typeof value === 'number') return value === 1
  return /^(true|1|yes|active|subscriber|subscribed)$/i.test(clean(value))
}

function listIncludes(value, list) {
  const normalized = clean(value).toLowerCase()
  if (!normalized) return false
  return String(list || '')
    .split(',')
    .map((entry) => clean(entry).toLowerCase())
    .filter(Boolean)
    .includes(normalized)
}

export function getBearerToken(headers = {}) {
  const authorization = headers.authorization || headers.Authorization || ''
  const match = typeof authorization === 'string' ? authorization.match(/^Bearer\s+(.+)$/i) : null
  return match ? match[1].trim() : ''
}

export function getUserEntitlements(user, env = process.env) {
  const appMetadata = user?.app_metadata && typeof user.app_metadata === 'object' ? user.app_metadata : {}
  const userMetadata = user?.user_metadata && typeof user.user_metadata === 'object' ? user.user_metadata : {}
  const email = clean(user?.email).toLowerCase()
  const userId = clean(user?.id)
  const metadataFlags = [
    appMetadata.subscriber,
    appMetadata.subscribed,
    appMetadata.is_subscriber,
    appMetadata.deep_dive_unlimited,
    appMetadata.deepDiveUnlimited,
    userMetadata.subscriber,
    userMetadata.subscribed,
    userMetadata.is_subscriber,
    userMetadata.deep_dive_unlimited,
    userMetadata.deepDiveUnlimited,
  ]

  const isSubscriber = metadataFlags.some(isTruthyFlag) ||
    listIncludes(email, env.DEEP_DIVE_SUBSCRIBER_EMAILS) ||
    listIncludes(userId, env.DEEP_DIVE_SUBSCRIBER_USER_IDS)

  return {
    deepDiveUnlimited: isSubscriber,
    isSubscriber,
  }
}

export async function verifySupabaseBearerToken(headers = {}) {
  const token = getBearerToken(headers)

  if (!token) {
    return { ok: false, reason: 'missing_token', user: null }
  }

  if (!isSupabaseConfigured()) {
    return { ok: false, reason: 'supabase_not_configured', user: null }
  }

  const supabase = getSupabaseAdminClient()

  if (!supabase) {
    return { ok: false, reason: 'supabase_not_configured', user: null }
  }

  const { data, error } = await supabase.auth.getUser(token)

  if (error || !data?.user?.id) {
    return { ok: false, reason: 'invalid_token', user: null }
  }

  return { ok: true, entitlements: getUserEntitlements(data.user), reason: 'verified', user: data.user }
}
