import express from 'express'
import { createClient } from '@supabase/supabase-js'
import { resolveCorsOrigin } from '../lib/http.js'
import { kailaConfig } from './config.js'

const rateLimitBuckets = new Map()

const supabase = createClient(kailaConfig.supabaseUrl, kailaConfig.supabaseServiceRoleKey)

function db() {
  return supabase.schema(kailaConfig.supabaseDbSchema)
}

const STOP_WORDS = new Set([
  'a',
  'an',
  'and',
  'are',
  'can',
  'come',
  'does',
  'for',
  'has',
  'how',
  'in',
  'is',
  'it',
  'of',
  'on',
  'product',
  'the',
  'this',
  'to',
  'what',
  'with',
])

const TOKEN_SYNONYMS = new Map([
  ['color', ['shade', 'finish', 'appearance']],
  ['shade', ['color', 'finish', 'appearance']],
  ['compatible', ['compatibility', 'adapter', 'match']],
  ['compatibility', ['compatible', 'adapter', 'match']],
  ['car', ['seat', 'adapter', 'compatible']],
  ['fold', ['folded', 'compact', 'storage']],
  ['storage', ['fold', 'folded', 'compact']],
  ['weight', ['limit', 'lb', 'pound']],
])

function normalizeToken(token) {
  if (token.endsWith('ies') && token.length > 4) {
    return `${token.slice(0, -3)}y`
  }

  if (token.endsWith('s') && token.length > 3) {
    return token.slice(0, -1)
  }

  return token
}

function tokenize(value) {
  return value
    .toLowerCase()
    .split(/[^a-z0-9_]+/)
    .map(normalizeToken)
    .filter((token) => token.length > 1 && !STOP_WORDS.has(token))
}

function expandTokens(tokens) {
  const expanded = new Set(tokens)

  for (const token of tokens) {
    for (const synonym of TOKEN_SYNONYMS.get(token) || []) {
      expanded.add(synonym)
    }
  }

  return Array.from(expanded)
}

function scorePassage(passage, queryTokens) {
  const passageTokens = new Set(
    tokenize(
      [
        passage.text,
        passage.source_type,
        passage.value ? JSON.stringify(passage.value) : '',
      ].join(' ')
    )
  )

  return queryTokens.reduce((score, token) => {
    return passageTokens.has(token) ? score + 1 : score
  }, 0)
}

async function retrieve(storeId, productIds, query) {
  const { data, error } = await db()
    .from('passages')
    .select('id, store_id, product_id, source_type, source_id, text, value, meta')
    .eq('store_id', storeId)
    .in('product_id', productIds)
    .order('created_at', { ascending: true })
    .limit(kailaConfig.maxPassages)

  if (error) {
    throw new Error(`retrieve: ${error.message}`)
  }

  const queryTokens = expandTokens(tokenize(query))
  const scoredPassages = (data || [])
    .map((passage, index) => ({
      passage,
      index,
      score: scorePassage(passage, queryTokens),
    }))
    .filter(({ score }) => score > 0)
    .sort((left, right) => right.score - left.score || left.index - right.index)
    .map(({ passage }) => passage)

  return scoredPassages.slice(0, kailaConfig.maxPassages)
}

function respond(question, passages) {
  void question

  if (passages.length === 0) {
    return "I don't know - here's the product page."
  }

  const citedFacts = passages
    .slice(0, 3)
    .map((passage) => passage.text.trim())
    .filter(Boolean)

  if (citedFacts.length === 0) {
    return "I don't know - here's the product page."
  }

  return citedFacts.join('\n\n')
}

function isValidAskBody(body) {
  return (
    body &&
    typeof body.storeRef === 'string' &&
    body.storeRef.trim().length > 0 &&
    Array.isArray(body.productIds) &&
    body.productIds.length > 0 &&
    body.productIds.length <= kailaConfig.maxProductIds &&
    body.productIds.every((productId) => typeof productId === 'string' && productId.trim().length > 0) &&
    typeof body.question === 'string' &&
    body.question.trim().length > 0 &&
    body.question.length <= kailaConfig.maxQuestionChars
  )
}

function askRateLimit(request, response, next) {
  const now = Date.now()
  const key = request.ip || 'unknown'
  const bucket = rateLimitBuckets.get(key)

  if (!bucket || bucket.resetAt <= now) {
    rateLimitBuckets.set(key, {
      count: 1,
      resetAt: now + kailaConfig.rateLimitWindowMs,
    })
    next()
    return
  }

  if (bucket.count >= kailaConfig.rateLimitMax) {
    response.status(429).json({ error: 'Rate limit exceeded' })
    return
  }

  bucket.count += 1
  next()
}

export function createKailaRouter() {
  const router = express.Router()

  router.use((request, response, next) => {
    response.set({
      'Access-Control-Allow-Origin': resolveCorsOrigin(request.headers.origin),
      Vary: 'Origin',
    })
    next()
  })

  router.use(express.json({ limit: '32kb' }))

  router.get('/health', (request, response) => {
    response.json({ ok: true })
  })

  router.post('/ask', askRateLimit, async (request, response, next) => {
    if (!isValidAskBody(request.body)) {
      response.status(400).json({ error: 'Invalid request body' })
      return
    }

    try {
      const { storeRef, productIds, question } = request.body

      const { data, error } = await db()
        .from('stores')
        .select('id')
        .eq('embed_key', storeRef)
        .maybeSingle()

      if (error) {
        response.status(500).json({ error: 'Unexpected store lookup error' })
        return
      }

      if (!data) {
        response.status(404).json({ error: 'Store not found' })
        return
      }

      const passages = await retrieve(data.id, productIds, question)
      const answer = await respond(question, passages)

      response.json({
        answer,
        passageIds: passages.map((passage) => passage.id),
        citations: passages.map((passage) => ({
          id: passage.id,
          sourceType: passage.source_type,
          text: passage.text,
        })),
        fallbackUrl: null,
      })
    } catch (error) {
      if (error instanceof Error && error.message.endsWith('not implemented')) {
        response.status(501).json({ error: error.message })
        return
      }

      next(error)
    }
  })

  return router
}
