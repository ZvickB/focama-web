import express from 'express'
import { resolveCorsOrigin } from '../lib/http.js'
import { kailaConfig } from './config.js'
import { db } from './db.js'
import { retrieve } from './retrieval.js'
import { isPlainObject, validateAnswerResult } from './answer-validation.js'
import { deterministicAnswerResult, fallbackResult } from './deterministic-answer.js'

const rateLimitBuckets = new Map()

async function aiRespond(question, passages, followUpContext) {
  const response = await fetch('https://api.openai.com/v1/responses', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${kailaConfig.openaiApiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: kailaConfig.responseModel,
      text: {
        format: {
          type: 'json_schema',
          name: 'kaila_answer_result',
          strict: true,
          schema: {
            type: 'object',
            additionalProperties: false,
            required: [
              'mode',
              'answer',
              'citedPassageIds',
              'followUpContext',
              'customerGoal',
              'interpretations',
              'rejectedPassages',
            ],
            properties: {
              mode: {
                type: 'string',
                enum: [
                  'direct_answer',
                  'multi_fact_answer',
                  'ambiguous_question',
                  'missing_fact',
                  'sensitive_or_confusing_wording',
                ],
              },
              answer: { type: 'string' },
              citedPassageIds: {
                type: 'array',
                items: { type: 'string' },
              },
              followUpContext: {
                anyOf: [
                  {
                    type: 'object',
                    additionalProperties: false,
                    required: ['originalQuestion', 'clarificationQuestion', 'mode'],
                    properties: {
                      originalQuestion: { type: 'string' },
                      clarificationQuestion: { type: 'string' },
                      mode: {
                        type: 'string',
                        enum: ['ambiguous_question', 'sensitive_or_confusing_wording'],
                      },
                    },
                  },
                  { type: 'null' },
                ],
              },
              customerGoal: {
                anyOf: [{ type: 'string' }, { type: 'null' }],
              },
              interpretations: {
                type: 'array',
                items: {
                  type: 'object',
                  additionalProperties: false,
                  required: ['topic', 'supportedPassageIds'],
                  properties: {
                    topic: { type: 'string' },
                    supportedPassageIds: {
                      type: 'array',
                      items: { type: 'string' },
                    },
                  },
                },
              },
              rejectedPassages: {
                type: 'array',
                items: {
                  type: 'object',
                  additionalProperties: false,
                  required: ['passageId', 'reason'],
                  properties: {
                    passageId: { type: 'string' },
                    reason: { type: 'string' },
                  },
                },
              },
            },
          },
        },
        verbosity: 'low',
      },
      instructions: [
        'You are KAILA, a warm shopping assistant for a Shopify product page.',
        'Use only the provided product passages. Never invent product facts, compatibility, colors, prices, dimensions, availability, policies, or safety claims.',
        'Return exactly one answer mode.',
        'Before choosing the answer mode, identify the customerGoal, group useful evidence into interpretations, and reject irrelevant evidence.',
        'Every provided passage must appear either in exactly one rejectedPassages item or in at least one interpretation supportedPassageIds list.',
        'Reject passages that match words but do not support the customerGoal or a plausible interpretation.',
        'An interpretation is a distinct possible meaning of the customer question, not merely a separate fact.',
        'Complementary facts that all answer the same customer goal are one interpretation.',
        'Create separate interpretations only when the customer would be asking a different question for each interpretation.',
        'If the facts can be combined into one helpful answer without asking the customer to choose, keep them in one interpretation.',
        'If the customer question could plausibly mean more than one thing and the passages support more than one topic, return all supported interpretations and choose ambiguous_question.',
        'direct_answer: one clear fact answers the customer question.',
        'multi_fact_answer: several related facts together answer one coherent question.',
        'ambiguous_question: the customer question could mean different product topics. Ask one concise clarifying question and do not answer as fact.',
        'missing_fact: the passages do not contain the requested fact. Clearly state the missing fact.',
        'sensitive_or_confusing_wording: wording is charged, awkward, or should not be treated as a normal product fact lookup. Ask a warm clarifying question.',
        'Mode precedence: sensitive_or_confusing_wording, ambiguous_question, missing_fact, multi_fact_answer, direct_answer.',
        'Use direct_answer or multi_fact_answer only when the supported interpretations array has exactly one topic.',
        'Use ambiguous_question when supported interpretations contains two or more plausible topics, even if one topic has a strong passage match.',
        'For direct_answer and multi_fact_answer, cite every passage id used and cite at least one passage.',
        'For ambiguous_question and sensitive_or_confusing_wording, citedPassageIds may be empty and followUpContext must describe the clarification.',
        'For missing_fact, citedPassageIds may be empty unless you mention a closest supported fact.',
        'Every supportedPassageIds value in interpretations must be one of the provided passage ids.',
        'Every rejectedPassages passageId must be one of the provided passage ids.',
        'Cited passage ids must be included in a supportedPassageIds list, not rejectedPassages.',
        'If followUpContext is present, treat the question as a continuation of that prior clarification.',
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
                followUpContext,
                passages: passages.map((passage) => ({
                  id: passage.id,
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
    return deterministicAnswerResult(question, passages)
  }

  const body = await response.json()
  const answer = typeof body.output_text === 'string' ? body.output_text.trim() : ''
  if (!answer) {
    return deterministicAnswerResult(question, passages)
  }

  try {
    const answerResult = validateAnswerResult(JSON.parse(answer), passages, question)
    return answerResult || deterministicAnswerResult(question, passages)
  } catch {
    return deterministicAnswerResult(question, passages)
  }
}

async function respond(question, passages, followUpContext = null) {
  if (passages.length === 0) {
    return fallbackResult(question)
  }

  if (!kailaConfig.openaiApiKey || !kailaConfig.responseModel) {
    return deterministicAnswerResult(question, passages)
  }

  return aiRespond(question, passages, followUpContext)
}

function isValidFollowUpContext(value) {
  if (value === undefined || value === null) {
    return true
  }

  if (!isPlainObject(value)) {
    return false
  }

  return (
    typeof value.originalQuestion === 'string' &&
    value.originalQuestion.trim().length > 0 &&
    value.originalQuestion.length <= kailaConfig.maxQuestionChars &&
    typeof value.clarificationQuestion === 'string' &&
    value.clarificationQuestion.trim().length > 0 &&
    value.clarificationQuestion.length <= kailaConfig.maxQuestionChars &&
    (value.mode === 'ambiguous_question' || value.mode === 'sensitive_or_confusing_wording')
  )
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
    body.question.length <= kailaConfig.maxQuestionChars &&
    isValidFollowUpContext(body.followUpContext)
  )
}

function buildQuestionWithContext(question, followUpContext) {
  if (!followUpContext) {
    return question
  }

  return [
    `Original customer question: ${followUpContext.originalQuestion}`,
    `KAILA clarification question: ${followUpContext.clarificationQuestion}`,
    `Customer follow-up: ${question}`,
    'Answer the follow-up as a continuation of the original product question.',
  ].join('\n')
}

async function resolveStoreId(storeRef) {
  const { data, error } = await db()
    .from('stores')
    .select('id')
    .eq('embed_key', storeRef)
    .maybeSingle()

  if (error) {
    return { errorStatus: 500, error: 'Unexpected store lookup error' }
  }

  if (!data) {
    return { errorStatus: 404, error: 'Store not found' }
  }

  return { storeId: data.id }
}

function buildAskResponse(answerResult, passages) {
  const citedPassageIds = new Set(answerResult.citedPassageIds)
  const citedPassages = passages.filter((passage) => citedPassageIds.has(passage.id))

  return {
    answer: answerResult.answer,
    mode: answerResult.mode,
    citedPassageIds: answerResult.citedPassageIds,
    followUpContext: answerResult.followUpContext,
    passageIds: answerResult.citedPassageIds,
    citations: citedPassages.map((passage) => ({
      id: passage.id,
      sourceType: passage.source_type,
      text: passage.text,
    })),
    fallbackUrl: null,
  }
}

function writeSse(response, event, data) {
  response.write(`event: ${event}\n`)
  response.write(`data: ${JSON.stringify(data)}\n\n`)
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
      const { storeRef, productIds, question, followUpContext } = request.body

      const storeResult = await resolveStoreId(storeRef)
      if ('error' in storeResult) {
        response.status(storeResult.errorStatus).json({ error: storeResult.error })
        return
      }

      const contextualQuestion = buildQuestionWithContext(question, followUpContext)
      const passages = await retrieve(storeResult.storeId, productIds, contextualQuestion)
      const answerResult = await respond(contextualQuestion, passages, followUpContext ?? null)

      response.json(buildAskResponse(answerResult, passages))
    } catch (error) {
      if (error instanceof Error && error.message.endsWith('not implemented')) {
        response.status(501).json({ error: error.message })
        return
      }

      next(error)
    }
  })

  router.post('/ask/stream', askRateLimit, async (request, response) => {
    response.setHeader('Content-Type', 'text/event-stream')
    response.setHeader('Cache-Control', 'no-cache')
    response.setHeader('Connection', 'keep-alive')
    response.flushHeaders?.()

    if (!isValidAskBody(request.body)) {
      writeSse(response, 'error', { error: 'Invalid request body' })
      response.end()
      return
    }

    try {
      const { storeRef, productIds, question, followUpContext } = request.body

      writeSse(response, 'status', { status: 'retrieving', message: 'Searching product info...' })
      const storeResult = await resolveStoreId(storeRef)
      if ('error' in storeResult) {
        writeSse(response, 'error', { error: storeResult.error })
        response.end()
        return
      }

      const contextualQuestion = buildQuestionWithContext(question, followUpContext)
      const passages = await retrieve(storeResult.storeId, productIds, contextualQuestion)

      writeSse(response, 'status', { status: 'answering', message: 'Preparing a grounded answer...' })
      const answerResult = await respond(contextualQuestion, passages, followUpContext ?? null)

      writeSse(response, 'status', { status: 'validating', message: 'Checking citations...' })
      writeSse(response, 'done', buildAskResponse(answerResult, passages))
      response.end()
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Something went wrong.'
      writeSse(response, 'error', { error: message })
      response.end()
    }
  })

  return router
}
