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

const ANSWER_MODES = new Set([
  'direct_answer',
  'multi_fact_answer',
  'ambiguous_question',
  'missing_fact',
  'sensitive_or_confusing_wording',
])

const ASK_BACK_MODES = new Set(['ambiguous_question', 'sensitive_or_confusing_wording'])

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

async function createEmbedding(input) {
  if (!kailaConfig.openaiApiKey) {
    return null
  }

  const response = await fetch('https://api.openai.com/v1/embeddings', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${kailaConfig.openaiApiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: kailaConfig.embeddingModel,
      input,
      encoding_format: 'float',
    }),
  })

  if (!response.ok) {
    const errorBody = await response.text()
    console.error('[kaila] OpenAI embedding failed', {
      status: response.status,
      body: errorBody.slice(0, 200),
    })
    return null
  }

  const body = await response.json()
  const embedding = body?.data?.[0]?.embedding

  return Array.isArray(embedding) ? embedding : null
}

async function retrieveByEmbedding(storeId, productIds, query) {
  const embedding = await createEmbedding(query)

  if (!embedding) {
    return null
  }

  const { data, error } = await db().rpc('match_passage_embeddings', {
    query_embedding: embedding,
    match_store_id: storeId,
    match_product_ids: productIds,
    match_embedding_model: kailaConfig.embeddingModel,
    match_count: kailaConfig.maxPassages,
    min_similarity: kailaConfig.embeddingMinSimilarity,
  })

  if (error) {
    console.warn('[kaila] Embedding retrieval unavailable; falling back to keyword retrieval', {
      message: error.message,
    })
    return null
  }

  if (!Array.isArray(data) || data.length === 0) {
    return []
  }

  return data.map((row) => {
    const passage = { ...row }
    delete passage.similarity
    return passage
  })
}

async function retrieveByKeyword(storeId, productIds, query) {
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

async function retrieve(storeId, productIds, query) {
  const embeddingPassages = await retrieveByEmbedding(storeId, productIds, query)

  if (embeddingPassages) {
    return embeddingPassages
  }

  return retrieveByKeyword(storeId, productIds, query)
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

function labelPassage(passage) {
  const tokens = new Set(tokenize([passage.text, passage.value ? JSON.stringify(passage.value) : ''].join(' ')))

  if (tokens.has('shade') || tokens.has('color') || tokens.has('available')) {
    return 'Color options'
  }

  if (tokens.has('child') && tokens.has('weight') && tokens.has('limit')) {
    return 'Child weight limit'
  }

  if (tokens.has('compatible') || tokens.has('adapter') || tokens.has('car')) {
    return 'Compatibility'
  }

  if (tokens.has('fold') || tokens.has('compact') || tokens.has('storage')) {
    return 'Fold and storage'
  }

  return passage.source_type.charAt(0).toUpperCase() + passage.source_type.slice(1)
}

function deterministicRespond(question, passages) {
  const citedFacts = passages.slice(0, 3).reduce((facts, passage) => {
    const text = passage.text.trim()

    if (!text) {
      return facts
    }

    facts.push({
      label: labelPassage(passage),
      text,
    })

    return facts
  }, [])

  if (citedFacts.length === 0) {
    return fallbackAnswer(question)
  }

  if (citedFacts.length === 1) {
    return citedFacts[0].text
  }

  return [
    'I found a few relevant details in the provided product info:',
    ...citedFacts.map((fact) => `- ${fact.label}: ${fact.text}`),
  ].join('\n')
}

function fallbackResult(question) {
  return {
    mode: 'missing_fact',
    answer: fallbackAnswer(question),
    citedPassageIds: [],
    followUpContext: null,
    customerGoal: null,
    interpretations: [],
    rejectedPassages: [],
  }
}

function deterministicAnswerResult(question, passages) {
  if (passages.length === 0) {
    return fallbackResult(question)
  }

  const citedPassageIds = passages
    .slice(0, Math.min(passages.length, 3))
    .map((passage) => passage.id)
    .filter(Boolean)

  return {
    mode: citedPassageIds.length > 1 ? 'multi_fact_answer' : 'direct_answer',
    answer: deterministicRespond(question, passages),
    citedPassageIds,
    followUpContext: null,
    customerGoal: null,
    interpretations: citedPassageIds.length
      ? [
          {
            topic: question,
            supportedPassageIds: citedPassageIds,
          },
        ]
      : [],
    rejectedPassages: passages
      .filter((passage) => !citedPassageIds.includes(passage.id))
      .map((passage) => ({
        passageId: passage.id,
        reason: 'Not used in the deterministic answer.',
      })),
  }
}

function isPlainObject(value) {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function isAnswerMode(value) {
  return typeof value === 'string' && ANSWER_MODES.has(value)
}

function validateFollowUpContextForAnswer(value, mode, question, answer) {
  if (!ASK_BACK_MODES.has(mode)) {
    return null
  }

  if (!isPlainObject(value)) {
    return {
      originalQuestion: question,
      clarificationQuestion: answer,
      mode,
    }
  }

  const originalQuestion =
    typeof value.originalQuestion === 'string' && value.originalQuestion.trim()
      ? value.originalQuestion.trim()
      : question
  const clarificationQuestion =
    typeof value.clarificationQuestion === 'string' && value.clarificationQuestion.trim()
      ? value.clarificationQuestion.trim()
      : answer

  return {
    originalQuestion,
    clarificationQuestion,
    mode,
  }
}

function parseAnswerResult(value, question) {
  if (!isPlainObject(value) || !isAnswerMode(value.mode) || typeof value.answer !== 'string') {
    return null
  }

  const answer = value.answer.trim()
  if (!answer) {
    return null
  }

  return {
    mode: value.mode,
    answer,
    followUpContext: validateFollowUpContextForAnswer(value.followUpContext, value.mode, question, answer),
    customerGoal:
      typeof value.customerGoal === 'string' && value.customerGoal.trim() ? value.customerGoal.trim() : null,
  }
}

function validatePassageIdList(value, passageIds) {
  if (!Array.isArray(value)) {
    return null
  }

  const validIds = []
  for (const passageId of value) {
    if (typeof passageId !== 'string' || !passageIds.has(passageId)) {
      return null
    }

    if (!validIds.includes(passageId)) {
      validIds.push(passageId)
    }
  }

  return validIds
}

function validateInterpretations(value, passageIds) {
  if (!Array.isArray(value)) {
    return null
  }

  const interpretations = []
  const seenTopics = new Set()

  for (const interpretation of value) {
    if (!isPlainObject(interpretation) || typeof interpretation.topic !== 'string') {
      return null
    }

    const topic = interpretation.topic.trim()
    if (!topic) {
      return null
    }

    const supportedPassageIds = validatePassageIdList(interpretation.supportedPassageIds, passageIds)
    if (!supportedPassageIds) {
      return null
    }

    const topicKey = topic.toLowerCase()
    if (!seenTopics.has(topicKey)) {
      interpretations.push({ topic, supportedPassageIds })
      seenTopics.add(topicKey)
    }
  }

  return interpretations
}

function validateRejectedPassages(value, passageIds) {
  if (!Array.isArray(value)) {
    return null
  }

  const rejectedPassages = []
  const seenIds = new Set()

  for (const rejection of value) {
    if (!isPlainObject(rejection) || typeof rejection.passageId !== 'string' || typeof rejection.reason !== 'string') {
      return null
    }

    const passageId = rejection.passageId.trim()
    const reason = rejection.reason.trim()
    if (!passageIds.has(passageId) || !reason || seenIds.has(passageId)) {
      return null
    }

    rejectedPassages.push({ passageId, reason })
    seenIds.add(passageId)
  }

  return rejectedPassages
}

function evidenceCoversRetrievedPassages(interpretations, rejectedPassages, passages) {
  const supportedIds = new Set(interpretations.flatMap((interpretation) => interpretation.supportedPassageIds))
  const rejectedIds = new Set(rejectedPassages.map((rejection) => rejection.passageId))

  for (const supportedId of supportedIds) {
    if (rejectedIds.has(supportedId)) {
      return false
    }
  }

  return passages.every((passage) => supportedIds.has(passage.id) || rejectedIds.has(passage.id))
}

function citedPassagesAreSupported(citedPassageIds, interpretations) {
  const supportedIds = new Set(interpretations.flatMap((interpretation) => interpretation.supportedPassageIds))
  return citedPassageIds.every((passageId) => supportedIds.has(passageId))
}

function clarificationFromInterpretations(interpretations, question, customerGoal, rejectedPassages) {
  if (interpretations.length < 2) {
    return null
  }

  const topics = interpretations.map((interpretation) => interpretation.topic)
  const answer = `Do you mean ${topics.slice(0, -1).join(', ')} or ${topics.at(-1)}?`

  return {
    mode: 'ambiguous_question',
    answer,
    citedPassageIds: [],
    followUpContext: {
      originalQuestion: question,
      clarificationQuestion: answer,
      mode: 'ambiguous_question',
    },
    customerGoal,
    interpretations,
    rejectedPassages,
  }
}

function validateAnswerResult(value, passages, question) {
  const parsed = parseAnswerResult(value, question)
  if (!parsed || !isPlainObject(value) || !Array.isArray(value.citedPassageIds)) {
    return null
  }

  const passageIds = new Set(passages.map((passage) => passage.id))
  const citedPassageIds = validatePassageIdList(value.citedPassageIds, passageIds)
  const interpretations = validateInterpretations(value.interpretations, passageIds)
  const rejectedPassages = validateRejectedPassages(value.rejectedPassages, passageIds)
  if (!citedPassageIds || !interpretations || !rejectedPassages) {
    return null
  }

  if (!evidenceCoversRetrievedPassages(interpretations, rejectedPassages, passages)) {
    return null
  }

  if ((parsed.mode === 'direct_answer' || parsed.mode === 'multi_fact_answer') && interpretations.length !== 1) {
    return clarificationFromInterpretations(interpretations, question, parsed.customerGoal, rejectedPassages)
  }

  if ((parsed.mode === 'direct_answer' || parsed.mode === 'multi_fact_answer') && citedPassageIds.length === 0) {
    return null
  }

  if (citedPassageIds.length > 0 && !citedPassagesAreSupported(citedPassageIds, interpretations)) {
    return null
  }

  return {
    ...parsed,
    citedPassageIds,
    interpretations,
    rejectedPassages,
  }
}

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
