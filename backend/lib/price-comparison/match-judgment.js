import Anthropic from '@anthropic-ai/sdk'
import { DEFAULT_HAIKU_MODEL } from '../ai-selector.js'

const DEFAULT_CONFIDENCE_THRESHOLD = 0.85
const DEFAULT_MIN_SAVINGS = 8
const DEFAULT_MIN_SAVINGS_PERCENT = 0.08

function finiteNumber(value) {
  if (value == null || value === '') return null
  const number = Number(value)
  return Number.isFinite(number) ? number : null
}

function normalizeUsage(usage) {
  if (!usage || typeof usage !== 'object' || Array.isArray(usage)) return null
  return {
    inputTokens: finiteNumber(usage.input_tokens) ?? 0,
    outputTokens: finiteNumber(usage.output_tokens) ?? 0,
  }
}

function getMatchIdentifier(product) {
  const identifier = product?.match_identifier || product?.matchIdentifier || {}
  return {
    brand: identifier.brand || null,
    model_number: identifier.model_number || identifier.modelNumber || null,
    product_type: identifier.product_type || identifier.productType || '',
    attributes: identifier.attributes && typeof identifier.attributes === 'object' && !Array.isArray(identifier.attributes)
      ? identifier.attributes
      : {},
  }
}

function summarizeOffer(offer, index) {
  return {
    offer_index: index,
    retailer: offer?.retailer || null,
    price: offer?.price ?? null,
    currency: offer?.currency || null,
    title: offer?.title || '',
    condition: offer?.condition || null,
    seller: offer?.seller || null,
  }
}

function buildPrompt({ product, offers }) {
  const identifier = getMatchIdentifier(product)
  return [
    'You are a product matching classifier. Given a source product and a list of shopping offers, determine which offers are the SAME product (same brand, same model, same variant).',
    '',
    'Rules:',
    '- MATCH only if brand AND model/product name clearly match',
    '- REJECT if any structured attribute conflicts (different size, capacity, generation, color when color matters, pack count)',
    '- REJECT accessories, cases, replacement parts, bundles that include extras',
    '- REJECT refurbished/renewed/used unless the source is also that condition',
    '- REJECT if the offer title suggests a clearly different product',
    '- When unsure, reject - false negatives are better than false positives',
    '',
    'Source product:',
    `Title: ${product?.display_title || product?.displayTitle || ''}`,
    `Brand: ${identifier.brand || ''}`,
    `Model: ${identifier.model_number || ''}`,
    `Type: ${identifier.product_type || ''}`,
    `Attributes: ${JSON.stringify(identifier.attributes || {})}`,
    `Price: ${product?.price ?? ''} ${product?.currency || ''}`,
    '',
    'Shopping offers:',
    JSON.stringify(offers.map(summarizeOffer)),
  ].join('\n')
}

function extractToolInput(message) {
  const content = Array.isArray(message?.content) ? message.content : []
  const toolUse = content.find((part) => part?.type === 'tool_use' && part?.name === 'record_matches')
  if (toolUse?.input && typeof toolUse.input === 'object' && !Array.isArray(toolUse.input)) {
    return toolUse.input
  }

  const text = content.find((part) => part?.type === 'text' && typeof part?.text === 'string')?.text || ''
  const jsonMatch = text.match(/\{[\s\S]*\}/)
  if (!jsonMatch) return {}

  try {
    return JSON.parse(jsonMatch[0])
  } catch {
    return {}
  }
}

function normalizeMatchEntry(entry, offers, sourcePrice, {
  confidenceThreshold,
  minSavings,
  minSavingsPercent,
  sourceCurrency,
}) {
  const offerIndex = Number.parseInt(entry?.offer_index, 10)
  const offer = offers[offerIndex]
  if (!offer) return null
  if (entry?.is_match !== true) return null

  const confidence = finiteNumber(entry?.confidence)
  if (confidence == null || confidence < confidenceThreshold) return null

  const offerPrice = finiteNumber(offer.price)
  if (offerPrice == null || sourcePrice == null || sourcePrice <= 0) return null
  const offerCurrency = String(offer.currency || '').trim().toUpperCase()
  if (sourceCurrency && offerCurrency !== sourceCurrency) return null

  const savings = sourcePrice - offerPrice
  const savingsPercent = savings / sourcePrice
  if (savings < minSavings || savingsPercent < minSavingsPercent) return null

  return {
    offer_index: offerIndex,
    is_match: true,
    confidence,
    reason: String(entry?.reason || '').trim(),
    offer,
    savings: Number(savings.toFixed(2)),
    savings_percent: Number(savingsPercent.toFixed(4)),
  }
}

export async function judgeSerperMatches({
  product,
  offers,
  apiKey,
  model = DEFAULT_HAIKU_MODEL,
  anthropicClient = null,
  confidenceThreshold = DEFAULT_CONFIDENCE_THRESHOLD,
  minSavings = DEFAULT_MIN_SAVINGS,
  minSavingsPercent = DEFAULT_MIN_SAVINGS_PERCENT,
}) {
  if (!apiKey && !anthropicClient) {
    throw new Error('CLAUDE_API_KEY is required for Serper match judgment')
  }

  const normalizedOffers = Array.isArray(offers) ? offers : []
  if (normalizedOffers.length === 0) {
    return { model, matches: [], usage: null }
  }

  const anthropic = anthropicClient || new Anthropic({ apiKey })
  const message = await anthropic.messages.create({
    model,
    max_tokens: 1024,
    temperature: 0,
    system: 'You are a careful product matching classifier. Return only the requested structured data.',
    messages: [{ role: 'user', content: buildPrompt({ product, offers: normalizedOffers }) }],
    tools: [
      {
        name: 'record_matches',
        description: 'Record whether each shopping offer is the same product as the source product.',
        input_schema: {
          type: 'object',
          properties: {
            matches: {
              type: 'array',
              items: {
                type: 'object',
                properties: {
                  offer_index: { type: 'integer' },
                  is_match: { type: 'boolean' },
                  confidence: { type: 'number' },
                  reason: { type: 'string' },
                },
                required: ['offer_index', 'is_match', 'confidence', 'reason'],
                additionalProperties: false,
              },
            },
          },
          required: ['matches'],
          additionalProperties: false,
        },
      },
    ],
    tool_choice: { type: 'tool', name: 'record_matches' },
  })

  const parsed = extractToolInput(message)
  const sourcePrice = finiteNumber(product?.price)
  const sourceCurrency = String(product?.currency || '').trim().toUpperCase()
  const rawMatches = Array.isArray(parsed?.matches) ? parsed.matches : []
  const matches = rawMatches
    .map((entry) => normalizeMatchEntry(entry, normalizedOffers, sourcePrice, {
      confidenceThreshold,
      minSavings,
      minSavingsPercent,
      sourceCurrency,
    }))
    .filter(Boolean)

  return {
    model,
    matches,
    usage: normalizeUsage(message?.usage),
  }
}
