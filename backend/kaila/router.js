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
  'doe',
  'for',
  'has',
  'how',
  'in',
  'is',
  'it',
  'much',
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

function fallbackAnswer(question) {
  const tokens = tokenize(question)

  if (tokens.some((token) => ['weigh', 'weight'].includes(token))) {
    return "I don't know the product weight from the provided product info."
  }

  if (tokens.some((token) => ['price', 'cost', 'shipping'].includes(token))) {
    return "I don't know the price or shipping details from the provided product info."
  }

  if (tokens.some((token) => ['color', 'shade', 'finish'].includes(token))) {
    return "I don't know the available colors from the provided product info."
  }

  if (tokens.some((token) => ['compatible', 'compatibility', 'fit'].includes(token))) {
    return "I don't know the compatibility details from the provided product info."
  }

  if (tokens.some((token) => ['make', 'work', 'use'].includes(token))) {
    return "I don't know that from the provided product info."
  }

  const meaningfulTerms = tokens.filter((token) => !TOKEN_SYNONYMS.has(token))
  const subject = meaningfulTerms.slice(0, 4).join(' ')

  if (subject) {
    return `I don't know the ${subject} from the provided product info.`
  }

  return "I don't know from the provided product info."
}

function deterministicRespond(question, passages) {
  const citedFacts = passages
    .slice(0, 3)
    .map((passage) => passage.text.trim())
    .filter(Boolean)

  if (citedFacts.length === 0) {
    return fallbackAnswer(question)
  }

  return citedFacts.join('\n\n')
}

async function aiRespond(question, passages) {
  const response = await fetch('https://api.openai.com/v1/responses', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${kailaConfig.openaiApiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: kailaConfig.responseModel,
      instructions: [
        'You are KAILA, a concise shopping assistant.',
        'Answer using only the provided product passages.',
        'Do not invent product facts, compatibility, colors, prices, dimensions, availability, policies, or safety claims.',
        'If the passages partially answer the question, answer only the supported part and say what is not provided.',
        'If the passages do not answer the question, say what specific fact is not in the provided product info.',
        'Do not mention passage ids.',
      ].join('\n'),
      input: [
        {
          role: 'user',
          content: [
            {
              type: 'input_text',
              text: JSON.stringify({
                question,
                passages: passages.map((passage) => ({
                  sourceType: passage.source_type,
                  text: passage.text,
                  value: passage.value,
                })),
              }),
            },
          ],
        },
      ],
    }),
  })

  if (!response.ok) {
    const errorBody = await response.text()
    console.error('[kaila] OpenAI response failed', {
      status: response.status,
      body: errorBody.slice(0, 200),
    })
    return deterministicRespond(question, passages)
  }

  const body = await response.json()
  const answer = typeof body.output_text === 'string' ? body.output_text.trim() : ''

  return answer || deterministicRespond(question, passages)
}

async function respond(question, passages) {
  if (passages.length === 0) {
    return fallbackAnswer(question)
  }

  if (!kailaConfig.openaiApiKey || !kailaConfig.responseModel) {
    return deterministicRespond(question, passages)
  }

  return aiRespond(question, passages)
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

function parseProductIds(value) {
  if (Array.isArray(value)) {
    return value.flatMap(parseProductIds)
  }

  if (typeof value !== 'string') {
    return []
  }

  return value
    .split(',')
    .map((productId) => productId.trim())
    .filter(Boolean)
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

  router.get('/demo/passages', async (request, response, next) => {
    if (!kailaConfig.demoPassagesEnabled) {
      response.status(404).json({ error: 'Not found' })
      return
    }

    const storeRef = typeof request.query.storeRef === 'string' ? request.query.storeRef.trim() : ''
    const productIds = parseProductIds(request.query.productIds)

    if (!storeRef || productIds.length === 0 || productIds.length > kailaConfig.maxProductIds) {
      response.status(400).json({ error: 'Invalid demo passages request' })
      return
    }

    try {
      const { data: store, error: storeError } = await db()
        .from('stores')
        .select('id')
        .eq('embed_key', storeRef)
        .maybeSingle()

      if (storeError) {
        response.status(500).json({ error: 'Unexpected store lookup error' })
        return
      }

      if (!store) {
        response.status(404).json({ error: 'Store not found' })
        return
      }

      const { data: passages, error: passagesError } = await db()
        .from('passages')
        .select('id, product_id, source_type, source_id, text, value, meta')
        .eq('store_id', store.id)
        .in('product_id', productIds)
        .order('created_at', { ascending: true })

      if (passagesError) {
        response.status(500).json({ error: 'Unexpected passages lookup error' })
        return
      }

      response.json({
        passages: (passages || []).map((passage) => ({
          id: passage.id,
          productId: passage.product_id,
          sourceType: passage.source_type,
          sourceId: passage.source_id,
          text: passage.text,
          value: passage.value,
          meta: passage.meta,
        })),
      })
    } catch (error) {
      next(error)
    }
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
