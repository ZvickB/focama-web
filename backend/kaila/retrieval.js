import { kailaConfig } from './config.js'
import { db } from './db.js'

export const STOP_WORDS = new Set([
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

export const TOKEN_SYNONYMS = new Map([
  ['color', ['shade', 'finish', 'appearance']],
  ['shade', ['color', 'finish', 'appearance']],
  ['compatible', ['compatibility', 'adapter', 'match']],
  ['compatibility', ['compatible', 'adapter', 'match']],
  ['car', ['seat', 'adapter', 'compatible']],
  ['fold', ['folded', 'compact', 'storage']],
  ['storage', ['fold', 'folded', 'compact']],
  ['weight', ['limit', 'lb', 'pound']],
])

export function normalizeToken(token) {
  if (token.endsWith('ies') && token.length > 4) {
    return `${token.slice(0, -3)}y`
  }

  if (token.endsWith('s') && token.length > 3) {
    return token.slice(0, -1)
  }

  return token
}

export function tokenize(value) {
  return value
    .toLowerCase()
    .split(/[^a-z0-9_]+/)
    .map(normalizeToken)
    .filter((token) => token.length > 1 && !STOP_WORDS.has(token))
}

export function expandTokens(tokens) {
  const expanded = new Set(tokens)

  for (const token of tokens) {
    for (const synonym of TOKEN_SYNONYMS.get(token) || []) {
      expanded.add(synonym)
    }
  }

  return Array.from(expanded)
}

export function scorePassage(passage, queryTokens) {
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

export async function createEmbedding(input) {
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

export async function retrieveByEmbedding(storeId, productIds, query) {
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

export async function retrieveByKeyword(storeId, productIds, query) {
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

export async function retrieve(storeId, productIds, query) {
  const embeddingPassages = await retrieveByEmbedding(storeId, productIds, query)

  if (embeddingPassages) {
    return embeddingPassages
  }

  return retrieveByKeyword(storeId, productIds, query)
}
