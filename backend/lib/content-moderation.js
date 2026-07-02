export const MODERATION_OUTCOMES = { ALLOW: 'allow', HIDE_IMAGE: 'hide_image', BLOCK: 'block' }

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
  return moderation.outcome === MODERATION_OUTCOMES.HIDE_IMAGE
    ? { ...product, image: '', thumbnail: '', thumbnail_hd: '', moderation }
    : product
}

export function moderateProductList(products) {
  return Array.isArray(products) ? products.map(applyProductModeration).filter(Boolean) : []
}
