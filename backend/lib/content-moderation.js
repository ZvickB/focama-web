export const MODERATION_OUTCOMES = { ALLOW: 'allow', HIDE_IMAGE: 'hide_image', BLOCK: 'block' }
export const OPENAI_MODERATION_ENDPOINT = 'https://api.openai.com/v1/moderations'
export const OPENAI_MODERATION_MODEL = 'omni-moderation-latest'
export const DEFAULT_OPENAI_MODERATION_TIMEOUT_MS = 2000
export const QUERY_MODERATION_PENALTY_MS = 60 * 60 * 1000

const QUERY_MODERATION_PENALTIES = new Map()
const IN_FLIGHT_QUERY_MODERATION = new Map()
const OPENAI_BLOCK_CATEGORIES = ['sexual', 'sexual/minors']
const QUERY_MODERATION_PENALTY_PRUNE_INTERVAL_MS = 5 * 60 * 1000

let lastPenaltyPruneAt = 0

const PRODUCT_ID_ALLOWLIST = new Set([])
const BLOCK_RULES = [
  ['explicit-adult-product', /\b(?:sex|adult)\s+toys?\b|\bvibrat(?:or|er)s?\b|\bdildos?\b|\bmasturbat(?:e|ion|or)\b/i],
  ['explicit-erotic-content', /\berotic(?:a| fiction| romance)?\b|\bporn(?:ography|ographic)?\b/i],
  ['sexual-wellness', /\bsexual wellness\b|\barousal (?:gel|cream|oil)\b/i],
  ['personal-lubricant', /\b(?:personal|intimate|sexual) lubricants?\b|\bk[\s.-]*y (?:jelly|lubricant)\b/i],
  ['sexualized-lingerie', /\b(?:sexy|erotic|adult) lingerie\b|\blingerie (?:costume|roleplay|role play)\b/i],
]
const SAFE_ACCESSORIES = [
  /\b(?:bra|underwear|lingerie|swimwear|swimsuit) (?:organizer|hanger|wash bag|laundry bag|detergent|storage)\b/i,
  /\bbra (?:extender|strap|insert|pads?|laundry bag)\b/i,
  /\bswimsuit (?:cleaner|detergent|hanger)\b/i,
]
const ORDINARY_UNDERWEAR = /\b(?:underwear|briefs?|pant(?:y|ies))\b/i
const CHILD_APPAREL_CONTEXT = /\b(?:bab(?:y|ies)|children|children'?s|child|kids?|toddler|youth|boys?|girls?)\b/i
const MALE_APPAREL_CONTEXT = /\b(?:men|men'?s|mens|man|male)\b/i
const FEMALE_APPAREL_CONTEXT = /\b(?:women|woman'?s|womens|lad(?:y|ies)|lady'?s|female)\b/i
const BOXER_CONTEXT = /\bboxers?(?:\s+briefs?)?\b/i
const NON_ORDINARY_CHILD_INTIMATES = /\b(?:bras?|lingerie|bikinis?)\b/i
const HIDE_IMAGE_RULES = [
  ['womens-intimate-apparel', /\bbras?\b|\bpant(?:y|ies)\b|\bunderwear\b|\bbriefs?\b|\b(?:women|woman'?s|womens|lad(?:y|ies)|lady'?s|female)\s+lingerie\b/i],
  ['swimwear', /\bbikinis?\b|\bswimwear\b|\bswimsuits?\b|\b(?:women'?s|womens|girls?) bathing suits?\b/i],
  ['intimate-shapewear', /\bshapewear\b|\b(?:women'?s|womens) bodysuits?\b/i],
  ['revealing-apparel', /\bcrop tops?\b|\blingerie\b/i],
  ['sensitive-grooming', /\bbikini (?:trimmer|shaver|razor|groomer)\b|\bintimate (?:trimmer|shaver|groomer)\b/i],
]
const BOOK_CONTEXT = /\b(?:book|novel|paperback|hardcover|kindle|audiobook|workbook|textbook)\b/i
const SENSITIVE_BOOK_TOPICS = /\b(?:romance|marriage|marital intimacy|pregnancy|anatomy|sexual health|women'?s health)\b/i

function text(value) {
  return String(value ?? '')
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[\u2018\u2019\u02bc]/g, "'")
    .replace(/[_/\u2010-\u2015-]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

function fieldsFor(product) {
  const categories = Array.isArray(product?.categories)
    ? product.categories.map((entry) => typeof entry === 'string' ? entry : entry?.name)
    : []
  return {
    title: text(product?.title || product?.name),
    brand: text(product?.brand),
    category: [product?.category, product?.categories_flat, product?.productType, product?.type, ...categories].map(text).filter(Boolean).join(' '),
    metadata: [product?.snippet, product?.description, product?.tag, ...(product?.extensions || [])].map(text).filter(Boolean).join(' '),
    imageUrl: text(product?.image || product?.thumbnail || product?.thumbnail_hd),
  }
}

function result(outcome, reason, matchedField = '') { return { outcome, reason, matchedField } }

function normalizeTimeoutMs(value) {
  const parsed = Number(value)
  return Number.isFinite(parsed) && parsed > 0
    ? Math.max(1, Math.round(parsed))
    : DEFAULT_OPENAI_MODERATION_TIMEOUT_MS
}

function normalizeClientIp(clientIp) {
  const normalized = String(clientIp || '').trim()
  return normalized && normalized !== 'anonymous' ? normalized : ''
}

function getInFlightModerationKey(query, clientIp) {
  return `${normalizeClientIp(clientIp) || 'anonymous'}:${text(query).toLowerCase()}`
}

function getModerationFailureType(error) {
  if (error?.name === 'TimeoutError' || error?.name === 'AbortError') return 'timeout'
  return 'request_error'
}

function pruneExpiredQueryModerationPenalties(now = Date.now()) {
  if (now - lastPenaltyPruneAt < QUERY_MODERATION_PENALTY_PRUNE_INTERVAL_MS) return

  lastPenaltyPruneAt = now
  for (const [key, expiresAt] of QUERY_MODERATION_PENALTIES) {
    if (expiresAt <= now) QUERY_MODERATION_PENALTIES.delete(key)
  }
}

function openAiModerationResult({
  outcome = MODERATION_OUTCOMES.ALLOW,
  reason,
  categories = [],
  durationMs = 0,
  failedOpen = false,
  failureType = '',
}) {
  return {
    outcome,
    reason,
    matchedField: 'query',
    source: 'openai',
    categories,
    durationMs,
    failedOpen,
    failureType,
  }
}

export async function moderateQueryWithOpenAI(query, {
  apiKey,
  fetchImpl = globalThis.fetch,
  timeoutMs = DEFAULT_OPENAI_MODERATION_TIMEOUT_MS,
} = {}) {
  const startedAt = Date.now()

  if (!apiKey) {
    return openAiModerationResult({
      reason: 'openai-moderation-missing-api-key',
      failedOpen: true,
      failureType: 'missing_api_key',
    })
  }

  if (typeof fetchImpl !== 'function') {
    return openAiModerationResult({
      reason: 'openai-moderation-fetch-unavailable',
      failedOpen: true,
      failureType: 'fetch_unavailable',
    })
  }

  try {
    const response = await fetchImpl(OPENAI_MODERATION_ENDPOINT, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: OPENAI_MODERATION_MODEL,
        input: text(query),
      }),
      signal: AbortSignal.timeout(normalizeTimeoutMs(timeoutMs)),
    })

    if (!response.ok) {
      return openAiModerationResult({
        reason: 'openai-moderation-http-error',
        durationMs: Date.now() - startedAt,
        failedOpen: true,
        failureType: `http_${response.status || 'error'}`,
      })
    }

    const payload = await response.json()
    const categories = payload?.results?.[0]?.categories

    if (!categories || typeof categories !== 'object') {
      return openAiModerationResult({
        reason: 'openai-moderation-invalid-response',
        durationMs: Date.now() - startedAt,
        failedOpen: true,
        failureType: 'invalid_response',
      })
    }

    const blockedCategories = OPENAI_BLOCK_CATEGORIES.filter((category) => categories[category] === true)

    return openAiModerationResult({
      outcome: blockedCategories.length ? MODERATION_OUTCOMES.BLOCK : MODERATION_OUTCOMES.ALLOW,
      reason: blockedCategories.length ? 'openai-sexual-content' : 'openai-no-blocked-category',
      categories: blockedCategories,
      durationMs: Date.now() - startedAt,
    })
  } catch (error) {
    const failureType = getModerationFailureType(error)
    return openAiModerationResult({
      reason: failureType === 'timeout' ? 'openai-moderation-timeout' : 'openai-moderation-request-error',
      durationMs: Date.now() - startedAt,
      failedOpen: true,
      failureType,
    })
  }
}

export function isClientInQueryModerationPenaltyBox(clientIp, now = Date.now()) {
  const key = normalizeClientIp(clientIp)
  if (!key) return false

  pruneExpiredQueryModerationPenalties(now)
  const expiresAt = QUERY_MODERATION_PENALTIES.get(key) || 0
  if (expiresAt <= now) {
    QUERY_MODERATION_PENALTIES.delete(key)
    return false
  }

  return true
}

export function beginOpenAiQueryModeration(query, {
  apiKey,
  clientIp = '',
  fetchImpl = globalThis.fetch,
  timeoutMs = DEFAULT_OPENAI_MODERATION_TIMEOUT_MS,
} = {}) {
  const synchronous = isClientInQueryModerationPenaltyBox(clientIp)
  const inFlightKey = getInFlightModerationKey(query, clientIp)
  let promise = IN_FLIGHT_QUERY_MODERATION.get(inFlightKey)

  if (!promise) {
    promise = moderateQueryWithOpenAI(query, {
      apiKey,
      fetchImpl,
      timeoutMs,
    }).then((moderation) => {
      const penaltyKey = normalizeClientIp(clientIp)
      const penaltyApplied = moderation.outcome === MODERATION_OUTCOMES.BLOCK && Boolean(penaltyKey)

      if (penaltyApplied) {
        QUERY_MODERATION_PENALTIES.set(penaltyKey, Date.now() + QUERY_MODERATION_PENALTY_MS)
      }

      return { ...moderation, penaltyApplied }
    }).finally(() => {
      IN_FLIGHT_QUERY_MODERATION.delete(inFlightKey)
    })

    IN_FLIGHT_QUERY_MODERATION.set(inFlightKey, promise)
  }

  return { promise, synchronous }
}

export function resetQueryModerationState() {
  QUERY_MODERATION_PENALTIES.clear()
  IN_FLIGHT_QUERY_MODERATION.clear()
  lastPenaltyPruneAt = 0
}

function queueSensitiveImageShadowEvaluation(product, moderation) {
  if (String(process.env.SENSITIVE_IMAGE_SHADOW_ENABLED || '').trim().toLowerCase() !== 'true') return
  const imageUrl = String(product?.image || product?.thumbnail || product?.thumbnail_hd || '').trim()
  if (!imageUrl) return
  const entry = {
    productId: String(product?.asin || product?.product_id || product?.id || ''),
    title: String(product?.title || product?.name || '').slice(0, 300),
    imageUrl,
    moderationReason: moderation.reason,
  }
  void import('./sensitive-image-shadow.js')
    .then(({ enqueueSensitiveImageShadowEvaluation: enqueue }) => enqueue(entry))
    .catch((error) => console.warn('[sensitive-image-shadow] unable to queue evaluation', error?.message || error))
}

function matchRules(rules, fields, names) {
  for (const [reason, pattern] of rules) {
    for (const name of names) if (fields[name] && pattern.test(fields[name])) return { reason, matchedField: name }
  }
  return null
}

export function moderateQuery(query) {
  const match = matchRules(BLOCK_RULES, { query: text(query) }, ['query'])
  return match ? result(MODERATION_OUTCOMES.BLOCK, match.reason, 'query') : result(MODERATION_OUTCOMES.ALLOW, 'no-query-rule-match')
}

export function moderateProduct(product) {
  const productId = String(product?.asin || product?.product_id || product?.id || '').trim()
  if (productId && PRODUCT_ID_ALLOWLIST.has(productId)) return result(MODERATION_OUTCOMES.ALLOW, 'product-id-allowlist', 'productId')
  const fields = fieldsFor(product)
  const blocked = matchRules(BLOCK_RULES, fields, ['title', 'category', 'metadata'])
  if (blocked) return result(MODERATION_OUTCOMES.BLOCK, blocked.reason, blocked.matchedField)
  if (SAFE_ACCESSORIES.some((pattern) => pattern.test(fields.title))) return result(MODERATION_OUTCOMES.ALLOW, 'safe-accessory-allowlist', 'title')
  const apparelContext = `${fields.title} ${fields.category}`.trim()
  const ordinaryUnderwear = ORDINARY_UNDERWEAR.test(apparelContext)
  if (ordinaryUnderwear && CHILD_APPAREL_CONTEXT.test(apparelContext) && !NON_ORDINARY_CHILD_INTIMATES.test(apparelContext)) {
    return result(MODERATION_OUTCOMES.ALLOW, 'child-underwear-allowlist', fields.title ? 'title' : 'category')
  }
  if (
    ordinaryUnderwear &&
    (MALE_APPAREL_CONTEXT.test(apparelContext) || BOXER_CONTEXT.test(apparelContext)) &&
    !FEMALE_APPAREL_CONTEXT.test(apparelContext)
  ) {
    return result(MODERATION_OUTCOMES.ALLOW, 'mens-underwear-allowlist', fields.title ? 'title' : 'category')
  }
  const hidden = matchRules(HIDE_IMAGE_RULES, fields, ['title', 'category', 'metadata', 'imageUrl'])
  if (hidden) return result(MODERATION_OUTCOMES.HIDE_IMAGE, hidden.reason, hidden.matchedField)
  if (BOOK_CONTEXT.test(`${fields.title} ${fields.category}`) && SENSITIVE_BOOK_TOPICS.test(`${fields.title} ${fields.metadata}`)) {
    return result(MODERATION_OUTCOMES.HIDE_IMAGE, 'sensitive-book-topic', 'title')
  }
  return result(MODERATION_OUTCOMES.ALLOW, 'no-product-rule-match')
}

export function applyProductModeration(product) {
  const moderation = moderateProduct(product)
  if (process.env.NODE_ENV !== 'production' && moderation.outcome !== MODERATION_OUTCOMES.ALLOW) {
    console.info('[content-moderation] product moderated', {
      productId: String(product?.asin || product?.product_id || product?.id || ''),
      outcome: moderation.outcome,
      reason: moderation.reason,
      matchedField: moderation.matchedField,
    })
  }
  if (moderation.outcome === MODERATION_OUTCOMES.BLOCK) return null
  if (moderation.outcome === MODERATION_OUTCOMES.HIDE_IMAGE) queueSensitiveImageShadowEvaluation(product, moderation)
  return moderation.outcome === MODERATION_OUTCOMES.HIDE_IMAGE
    ? { ...product, image: '', thumbnail: '', thumbnail_hd: '', moderation }
    : product
}

export function moderateProductList(products) {
  return Array.isArray(products) ? products.map(applyProductModeration).filter(Boolean) : []
}
