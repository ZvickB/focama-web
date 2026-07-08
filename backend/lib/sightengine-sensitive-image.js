const SIGHTENGINE_ENDPOINT = 'https://api.sightengine.com/1.0/check.json'
const SIGHTENGINE_MODELS = 'people-counting,face-analysis'
const DEFAULT_TIMEOUT_MS = 10_000

export const DEFAULT_SIGHTENGINE_THRESHOLDS = Object.freeze({
  minimumNoPeopleConfidence: 0.8,
})

function score(value) {
  const number = Number(value)
  return Number.isFinite(number) ? number : 0
}

function boundedTimeout(value) {
  const timeout = Number(value)
  if (!Number.isFinite(timeout)) return DEFAULT_TIMEOUT_MS
  return Math.min(Math.max(Math.round(timeout), 1_000), 30_000)
}

export function getSightengineConfig(env = process.env) {
  return {
    apiUser: String(env.SIGHTENGINE_API_USER || '').trim(),
    apiSecret: String(env.SIGHTENGINE_API_SECRET || '').trim(),
    timeoutMs: boundedTimeout(env.SIGHTENGINE_TIMEOUT_MS),
  }
}

export function decideSightengineSensitiveImage(
  response,
  thresholds = DEFAULT_SIGHTENGINE_THRESHOLDS,
) {
  const peopleCount = response?.people_count || response?.['people-counting'] || {}
  const faces = Array.isArray(response?.faces) ? response.faces : []
  const artificialFaces = Array.isArray(response?.artificial_faces) ? response.artificial_faces : []
  const noPeopleConfidence = score(peopleCount['0'])
  const personConfidence = Math.max(
    score(peopleCount['1']),
    score(peopleCount['2']),
    score(peopleCount['3']),
    score(peopleCount['4']),
    score(peopleCount['5+']),
  )
  const reasons = []
  if (noPeopleConfidence < thresholds.minimumNoPeopleConfidence) reasons.push('person_present_or_uncertain')
  if (faces.length > 0) reasons.push('real_face_detected')
  if (artificialFaces.length > 0) reasons.push('artificial_face_detected')

  return {
    proposedOutcome: reasons.length === 0 ? 'show' : 'hide',
    reasons: reasons.length ? reasons : ['no_person_or_face_detected'],
    signals: {
      noPeopleConfidence,
      personConfidence,
      faceCount: faces.length,
      artificialFaceCount: artificialFaces.length,
    },
    thresholds: { ...thresholds },
  }
}

export async function analyzeSensitiveImageWithSightengine(
  imageUrl,
  { env = process.env, fetchImpl = globalThis.fetch } = {},
) {
  const config = getSightengineConfig(env)
  if (!config.apiUser || !config.apiSecret) throw new Error('sightengine_credentials_missing')
  if (typeof fetchImpl !== 'function') throw new Error('sightengine_fetch_unavailable')

  const requestUrl = new URL(SIGHTENGINE_ENDPOINT)
  requestUrl.searchParams.set('url', imageUrl)
  requestUrl.searchParams.set('models', SIGHTENGINE_MODELS)
  requestUrl.searchParams.set('api_user', config.apiUser)
  requestUrl.searchParams.set('api_secret', config.apiSecret)

  let response
  try {
    response = await fetchImpl(requestUrl, {
      method: 'GET',
      headers: { Accept: 'application/json' },
      signal: AbortSignal.timeout(config.timeoutMs),
    })
  } catch (error) {
    if (error?.name === 'TimeoutError' || error?.name === 'AbortError') throw new Error('sightengine_timeout')
    throw new Error('sightengine_request_failed')
  }

  if (!response?.ok) throw new Error(`sightengine_http_${response?.status || 'error'}`)

  let payload
  try {
    payload = await response.json()
  } catch {
    throw new Error('sightengine_invalid_json')
  }
  if (
    payload?.status !== 'success' ||
    !Array.isArray(payload?.faces) ||
    !Array.isArray(payload?.artificial_faces) ||
    (!payload?.people_count && !payload?.['people-counting'])
  ) {
    throw new Error('sightengine_invalid_response')
  }

  return {
    ...decideSightengineSensitiveImage(payload),
    provider: 'sightengine',
    providerRequestId: String(payload.request?.id || ''),
    operations: score(payload.request?.operations),
  }
}
