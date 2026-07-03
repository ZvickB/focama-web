import { Buffer } from 'node:buffer'
import { appendFile, mkdir } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'

import { analyzeSensitiveImageBuffer } from './sensitive-image-analysis.js'

const MAX_IMAGE_BYTES = 8 * 1024 * 1024
const FETCH_TIMEOUT_MS = 10_000
const MAX_SEEN_IMAGES = 1_000
const LOCAL_REPORT_PATH = resolve(process.cwd(), 'temp-data', 'sensitive-image-shadow', 'results.jsonl')
const DEFAULT_ALLOWED_HOSTS = new Set([
  'm.media-amazon.com',
  'images-na.ssl-images-amazon.com',
  'images-eu.ssl-images-amazon.com',
  'images-cn.ssl-images-amazon.com',
])

const seenImages = new Map()
let queue = Promise.resolve()

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

async function fetchImageBuffer(imageUrl) {
  const response = await fetch(imageUrl, {
    redirect: 'follow',
    signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
  })
  if (!response.ok) throw new Error(`image_fetch_failed_${response.status}`)
  if (!isAllowedSensitiveImageUrl(response.url)) throw new Error('image_redirect_host_not_allowed')
  if (!(response.headers.get('content-type') || '').toLowerCase().startsWith('image/')) {
    throw new Error('response_is_not_an_image')
  }
  const reader = response.body?.getReader()
  if (!reader) throw new Error('image_response_body_missing')
  const chunks = []
  let totalBytes = 0
  while (true) {
    const { done, value } = await reader.read()
    if (done) break
    totalBytes += value.byteLength
    if (totalBytes > MAX_IMAGE_BYTES) {
      await reader.cancel()
      throw new Error('image_exceeds_8mb_limit')
    }
    chunks.push(Buffer.from(value))
  }
  return Buffer.concat(chunks, totalBytes)
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
    const analysis = await analyzeSensitiveImageBuffer(await fetchImageBuffer(entry.imageUrl))
    await recordShadowResult({
      ...entry,
      evaluatedAt: new Date().toISOString(),
      durationMs: Date.now() - startedAt,
      proposedOutcome: analysis.proposedOutcome,
      reasons: analysis.reasons,
      signals: analysis.signals,
      shadowOnly: true,
    })
  } catch (error) {
    await recordShadowResult({
      ...entry,
      evaluatedAt: new Date().toISOString(),
      durationMs: Date.now() - startedAt,
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
