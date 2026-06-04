import { getEnv } from '../lib/search-data.js'

function readRequired(name, fallbackName) {
  const value = getEnv(name) || (fallbackName ? getEnv(fallbackName) : '')

  if (!value || !value.trim()) {
    throw new Error(`${name} is required`)
  }

  return value.trim()
}

function readOptional(name) {
  const value = getEnv(name)
  return value && value.trim() ? value.trim() : undefined
}

function readPositiveNumber(name, fallback) {
  const rawValue = readOptional(name)
  const value = rawValue ? Number(rawValue) : fallback

  if (!Number.isFinite(value) || value <= 0) {
    throw new Error(`${name} must be a positive number`)
  }

  return value
}

export const kailaConfig = {
  supabaseUrl: readRequired('KAILA_SUPABASE_URL', 'SUPABASE_URL'),
  supabaseServiceRoleKey: readRequired('KAILA_SUPABASE_SERVICE_ROLE_KEY', 'SUPABASE_SECRET_KEY'),
  supabaseDbSchema: readOptional('KAILA_SUPABASE_DB_SCHEMA') || 'kaila',
  maxProductIds: readPositiveNumber('KAILA_MAX_PRODUCT_IDS', 4),
  maxQuestionChars: readPositiveNumber('KAILA_MAX_QUESTION_CHARS', 1000),
  rateLimitWindowMs: readPositiveNumber('KAILA_RATE_LIMIT_WINDOW_MS', 60000),
  rateLimitMax: readPositiveNumber('KAILA_RATE_LIMIT_MAX', 30),
}
