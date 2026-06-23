import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'

import {
  getSupabaseAdminClient,
  isSupabaseConfigured,
  logStorageWarning,
} from './supabase-client.js'

const DEEP_DIVE_CACHE_PATH = resolve(process.cwd(), 'temp-data', 'deep-dive-cache.json')
const DEEP_DIVE_CACHE_TABLE = 'deep_dive_cache'
const DEEP_DIVE_USAGE_TABLE = 'deep_dive_usage'

function readLocalFile() {
  if (!existsSync(DEEP_DIVE_CACHE_PATH)) return { entries: {}, usage: {} }

  try {
    const parsed = JSON.parse(readFileSync(DEEP_DIVE_CACHE_PATH, 'utf8'))
    return {
      entries: parsed?.entries && typeof parsed.entries === 'object' ? parsed.entries : {},
      usage: parsed?.usage && typeof parsed.usage === 'object' ? parsed.usage : {},
    }
  } catch {
    return { entries: {}, usage: {} }
  }
}

function writeLocalFile(nextFile) {
  mkdirSync(resolve(process.cwd(), 'temp-data'), { recursive: true })
  writeFileSync(DEEP_DIVE_CACHE_PATH, JSON.stringify(nextFile, null, 2))
}

function isFresh(entry, now = Date.now()) {
  const expiresAt = new Date(entry?.expiresAt || entry?.expires_at || '').getTime()
  return Number.isFinite(expiresAt) && expiresAt > now
}

export async function readDeepDiveCacheEntry(cacheKey) {
  const key = String(cacheKey || '').trim()
  if (!key) return null

  if (isSupabaseConfigured()) {
    try {
      const supabase = getSupabaseAdminClient()
      const { data, error } = await supabase
        .from(DEEP_DIVE_CACHE_TABLE)
        .select('cache_key, layer, payload, cached_at, expires_at')
        .eq('cache_key', key)
        .maybeSingle()

      if (error) throw error
      if (data && isFresh(data)) {
        return {
          cacheKey: data.cache_key,
          layer: data.layer,
          payload: data.payload,
          cachedAt: data.cached_at,
          expiresAt: data.expires_at,
          storage: 'supabase',
        }
      }
    } catch (error) {
      logStorageWarning('Deep Dive cache read fell back to local storage', error)
    }
  }

  const local = readLocalFile()
  const entry = local.entries[key]
  return entry && isFresh(entry) ? { ...entry, storage: 'local' } : null
}

export async function writeDeepDiveCacheEntry({ cacheKey, layer, payload, ttlMs }) {
  const key = String(cacheKey || '').trim()
  const ttl = Number(ttlMs)
  if (!key || !Number.isFinite(ttl) || ttl <= 0) return null

  const cachedAt = new Date().toISOString()
  const expiresAt = new Date(Date.now() + ttl).toISOString()
  const entry = { cacheKey: key, layer, payload, cachedAt, expiresAt }

  if (isSupabaseConfigured()) {
    try {
      const supabase = getSupabaseAdminClient()
      const { error } = await supabase.from(DEEP_DIVE_CACHE_TABLE).upsert(
        {
          cache_key: key,
          layer,
          payload,
          cached_at: cachedAt,
          expires_at: expiresAt,
        },
        { onConflict: 'cache_key' },
      )

      if (error) throw error
      return { ...entry, storage: 'supabase' }
    } catch (error) {
      logStorageWarning('Deep Dive cache write fell back to local storage', error)
    }
  }

  const local = readLocalFile()
  local.entries[key] = entry
  writeLocalFile(local)
  return { ...entry, storage: 'local' }
}

export async function readDeepDiveUsage(userId) {
  const normalizedUserId = String(userId || '').trim()
  if (!normalizedUserId) return { count: 0 }

  if (isSupabaseConfigured()) {
    try {
      const supabase = getSupabaseAdminClient()
      const { data, error } = await supabase
        .from(DEEP_DIVE_USAGE_TABLE)
        .select('user_id, used_count, updated_at')
        .eq('user_id', normalizedUserId)
        .maybeSingle()

      if (error) throw error
      return { count: Number(data?.used_count || 0), updatedAt: data?.updated_at || '' }
    } catch (error) {
      logStorageWarning('Deep Dive usage read fell back to local storage', error)
    }
  }

  const local = readLocalFile()
  return { count: Number(local.usage[normalizedUserId]?.usedCount || 0), updatedAt: local.usage[normalizedUserId]?.updatedAt || '' }
}

export async function incrementDeepDiveUsage(userId) {
  const normalizedUserId = String(userId || '').trim()
  if (!normalizedUserId) return { count: 0 }

  const current = await readDeepDiveUsage(normalizedUserId)
  const nextCount = Number(current.count || 0) + 1
  const updatedAt = new Date().toISOString()

  if (isSupabaseConfigured()) {
    try {
      const supabase = getSupabaseAdminClient()
      const usageRow = {
        user_id: normalizedUserId,
        used_count: nextCount,
        last_used_at: updatedAt,
        updated_at: updatedAt,
      }
      if (current.count <= 0) usageRow.first_used_at = updatedAt

      const { error } = await supabase.from(DEEP_DIVE_USAGE_TABLE).upsert(
        usageRow,
        { onConflict: 'user_id' },
      )

      if (error) throw error
      return { count: nextCount, updatedAt }
    } catch (error) {
      logStorageWarning('Deep Dive usage write fell back to local storage', error)
    }
  }

  const local = readLocalFile()
  local.usage[normalizedUserId] = { usedCount: nextCount, updatedAt }
  writeLocalFile(local)
  return { count: nextCount, updatedAt }
}
