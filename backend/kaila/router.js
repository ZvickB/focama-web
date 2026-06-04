import express from 'express'
import { createClient } from '@supabase/supabase-js'
import { kailaConfig } from './config.js'

const rateLimitBuckets = new Map()

const supabase = createClient(kailaConfig.supabaseUrl, kailaConfig.supabaseServiceRoleKey)

function db() {
  return supabase.schema(kailaConfig.supabaseDbSchema)
}

function retrieve() {
  throw new Error('retrieve: not implemented')
}

function respond() {
  throw new Error('respond: not implemented')
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
      next(error)
    }
  })

  return router
}
