import { appendFile, mkdir } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'

import { analyzeSensitiveImageWithSightengine } from './sightengine-sensitive-image.js'

const MAX_SEEN_IMAGES = 1_000
const MIN_REQUEST_INTERVAL_MS = 1_100
const LOCAL_REPORT_PATH = resolve(process.cwd(), 'temp-data', 'sensitive-image-shadow', 'results.jsonl')
const DEFAULT_ALLOWED_HOSTS = new Set([
  'm.media-amazon.com',
  'images-na.ssl-images-amazon.com',
  'images-eu.ssl-images-amazon.com',
  'images-cn.ssl-images-amazon.com',
])

const seenImages = new Map()
let queue = Promise.resolve()
let lastRequestStartedAt = 0

export function isSensitiveImageShadowEnabled(env = process.env) {
  return String(env.SENSITIVE_IMAGE_SHADOW_ENABLED || '').trim().toLowerCase() === 'true'
}

export function isAllowedSensitiveImageUrl(value, env = process.env) {
  try {
    const url = new URL(value)
    if (url.protocol !== 'https:') return false
    const configuredHosts = String(env.SENSITIVE_IMAGE_SHADOW_ALLOWED_HOSTS || '')
      .split(',')
      .map((host) => host.trim().toLowerCase())
      .filter(Boolean)
    return new Set([...DEFAULT_ALLOWED_HOSTS, ...configuredHosts]).has(url.hostname.toLowerCase())
  } catch {
    return false
  }
}

async function waitForProviderSlot() {
  const waitMs = Math.max(0, MIN_REQUEST_INTERVAL_MS - (Date.now() - lastRequestStartedAt))
  if (waitMs > 0) await new Promise((resolveWait) => setTimeout(resolveWait, waitMs))
  lastRequestStartedAt = Date.now()
}

async function recordShadowResult(record) {
  console.info('[sensitive-image-shadow]', JSON.stringify(record))
  if (process.env.NODE_ENV === 'production') return
  await mkdir(dirname(LOCAL_REPORT_PATH), { recursive: true })
  await appendFile(LOCAL_REPORT_PATH, `${JSON.stringify(record)}\n`)
}

async function evaluateEntry(entry) {
  const startedAt = Date.now()
  try {
    await waitForProviderSlot()
    const analysis = await analyzeSensitiveImageWithSightengine(entry.imageUrl)
    await recordShadowResult({
      ...entry,
      evaluatedAt: new Date().toISOString(),
      durationMs: Date.now() - startedAt,
      provider: analysis.provider,
      providerRequestId: analysis.providerRequestId,
      operations: analysis.operations,
      proposedOutcome: analysis.proposedOutcome,
      reasons: analysis.reasons,
      signals: analysis.signals,
      thresholds: analysis.thresholds,
      shadowOnly: true,
    })
  } catch (error) {
    await recordShadowResult({
      ...entry,
      evaluatedAt: new Date().toISOString(),
      durationMs: Date.now() - startedAt,
      provider: 'sightengine',
      proposedOutcome: 'hide',
      reasons: ['analysis_failed'],
      error: error instanceof Error ? error.message : String(error),
      shadowOnly: true,
    })
  }
}

export function enqueueSensitiveImageShadowEvaluation(entry) {
  if (!entry?.imageUrl || !isAllowedSensitiveImageUrl(entry.imageUrl) || seenImages.has(entry.imageUrl)) return false
  if (seenImages.size >= MAX_SEEN_IMAGES) seenImages.delete(seenImages.keys().next().value)
  seenImages.set(entry.imageUrl, 'queued')
  queue = queue
    .catch(() => {})
    .then(() => evaluateEntry(entry))
    .catch((error) => console.warn('[sensitive-image-shadow] queue evaluation failed', error?.message || error))
    .finally(() => seenImages.set(entry.imageUrl, 'complete'))
  return true
}

export function waitForSensitiveImageShadowIdle() {
  return queue
}
