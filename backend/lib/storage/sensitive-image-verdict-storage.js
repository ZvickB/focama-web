import {
  isCurrentSensitiveImageVerdict,
  normalizeSensitiveImageUrl,
  SENSITIVE_IMAGE_DECISION_VERSION,
} from '../sensitive-image-verdict.js'
import {
  getSupabaseAdminClient,
  isSupabaseConfigured,
  logStorageWarning,
  SENSITIVE_IMAGE_VERDICTS_TABLE,
} from './supabase-client.js'

const memoryVerdicts = new Map()

function shouldUseSupabaseVerdictStorage(env = process.env) {
  return String(env.SENSITIVE_IMAGE_VERDICT_STORAGE || '').trim().toLowerCase() !== 'memory'
    && isSupabaseConfigured()
}

function mapRow(row) {
  if (!row?.image_url_hash || !row?.image_url) return null
  const verdict = {
    imageUrlHash: String(row.image_url_hash),
    imageUrl: normalizeSensitiveImageUrl(row.image_url),
    verdict: row.verdict,
    reasons: Array.isArray(row.reasons) ? row.reasons : [],
    signals: row.signals && typeof row.signals === 'object' && !Array.isArray(row.signals) ? row.signals : {},
    thresholds: row.thresholds && typeof row.thresholds === 'object' && !Array.isArray(row.thresholds) ? row.thresholds : {},
    decisionVersion: String(row.decision_version || ''),
    provider: String(row.provider || 'sightengine'),
    providerRequestId: String(row.provider_request_id || ''),
    operations: Math.max(0, Number(row.operations) || 0),
    checkedAt: String(row.checked_at || ''),
  }
  return verdict.imageUrl && isCurrentSensitiveImageVerdict(verdict) ? verdict : null
}

function uniqueHashes(values) {
  return Array.from(new Set(
    (Array.isArray(values) ? values : [])
      .map((value) => String(value || '').trim())
      .filter(Boolean),
  ))
}

export async function readSensitiveImageVerdicts(imageUrlHashes = []) {
  const hashes = uniqueHashes(imageUrlHashes)
  if (!hashes.length) return new Map()

  const results = new Map()
  const missing = []
  for (const hash of hashes) {
    const cached = memoryVerdicts.get(hash)
    if (isCurrentSensitiveImageVerdict(cached)) results.set(hash, cached)
    else missing.push(hash)
  }

  if (!missing.length || !shouldUseSupabaseVerdictStorage()) return results

  try {
    const supabase = getSupabaseAdminClient()
    const { data, error } = await supabase
      .from(SENSITIVE_IMAGE_VERDICTS_TABLE)
      .select('image_url_hash, image_url, verdict, reasons, signals, thresholds, decision_version, provider, provider_request_id, operations, checked_at')
      .in('image_url_hash', missing)
      .eq('decision_version', SENSITIVE_IMAGE_DECISION_VERSION)

    if (error) throw error
    for (const row of Array.isArray(data) ? data : []) {
      const verdict = mapRow(row)
      if (!verdict) continue
      memoryVerdicts.set(verdict.imageUrlHash, verdict)
      results.set(verdict.imageUrlHash, verdict)
    }
  } catch (error) {
    logStorageWarning('Sensitive image verdict read fell back to memory', error)
  }

  return results
}

export async function writeSensitiveImageVerdict(entry) {
  const imageUrlHash = String(entry?.imageUrlHash || '').trim()
  const imageUrl = normalizeSensitiveImageUrl(entry?.imageUrl)
  const verdictValue = entry?.verdict === 'show' || entry?.verdict === 'hide' ? entry.verdict : ''
  if (!imageUrlHash || !imageUrl || !verdictValue) return false

  const checkedAt = String(entry?.checkedAt || new Date().toISOString())
  const verdict = {
    imageUrlHash,
    imageUrl,
    verdict: verdictValue,
    reasons: Array.isArray(entry?.reasons) ? entry.reasons : [],
    signals: entry?.signals && typeof entry.signals === 'object' && !Array.isArray(entry.signals) ? entry.signals : {},
    thresholds: entry?.thresholds && typeof entry.thresholds === 'object' && !Array.isArray(entry.thresholds) ? entry.thresholds : {},
    decisionVersion: SENSITIVE_IMAGE_DECISION_VERSION,
    provider: String(entry?.provider || 'sightengine'),
    providerRequestId: String(entry?.providerRequestId || ''),
    operations: Math.max(0, Math.round(Number(entry?.operations) || 0)),
    checkedAt,
  }

  if (shouldUseSupabaseVerdictStorage()) {
    try {
      const supabase = getSupabaseAdminClient()
      const { error } = await supabase.from(SENSITIVE_IMAGE_VERDICTS_TABLE).upsert({
        image_url_hash: verdict.imageUrlHash,
        image_url: verdict.imageUrl,
        verdict: verdict.verdict,
        reasons: verdict.reasons,
        signals: verdict.signals,
        thresholds: verdict.thresholds,
        decision_version: verdict.decisionVersion,
        provider: verdict.provider,
        provider_request_id: verdict.providerRequestId,
        operations: verdict.operations,
        checked_at: verdict.checkedAt,
        updated_at: new Date().toISOString(),
      }, { onConflict: 'image_url_hash' })
      if (error) throw error
    } catch (error) {
      logStorageWarning('Sensitive image verdict write fell back to memory', error)
      memoryVerdicts.set(imageUrlHash, verdict)
      return false
    }
  }

  memoryVerdicts.set(imageUrlHash, verdict)
  return true
}

export function resetSensitiveImageVerdictMemory() {
  memoryVerdicts.clear()
}
