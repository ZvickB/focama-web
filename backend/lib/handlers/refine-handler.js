import { buildInternalErrorPayload, sendJson } from '../http.js'
import { reportBackendError } from '../observability.js'
import { getValidatedSearchRequest } from '../search-pipeline.js'
import { getEnv } from '../search-data.js'
import { generateRefinementPrompt } from '../refinement-assistant.js'
import {
  DEFAULT_HAIKU_MODEL,
  DEFAULT_REFINEMENT_MODEL,
} from '../ai-selector.js'
import {
  logSearchFlowEvent,
  nowMs,
  roundTimingDuration,
} from '../server-helpers.js'

export function getRefinementModel() {
  return getEnv('OPENAI_REFINEMENT_MODEL') || getEnv('OPENAI_MODEL') || DEFAULT_REFINEMENT_MODEL
}

export function getHaikuRefinementModel() {
  return getEnv('CLAUDE_REFINEMENT_MODEL') || getEnv('CLAUDE_MODEL') || DEFAULT_HAIKU_MODEL
}

export async function handleRefinementPrompt(requestUrl, response) {
  const requestStartedAt = nowMs()
  const openAiApiKey = getEnv('OPENAI_API_KEY')
  const anthropicApiKey = getEnv('CLAUDE_API_KEY')
  const { error, isValid, normalizedQuery } = getValidatedSearchRequest(requestUrl, {
    includeDetails: false,
  })

  if (!isValid) {
    logSearchFlowEvent('guided_refine_invalid', {
      route: '/api/search/refine',
      query: requestUrl.searchParams.get('query') || '',
      error,
    })
    sendJson(response, 400, { error })
    return
  }

  if (!anthropicApiKey && !openAiApiKey) {
    logSearchFlowEvent('guided_refine_missing_ai_key', {
      route: '/api/search/refine',
      query: normalizedQuery,
    })
    sendJson(response, 500, { error: 'CLAUDE_API_KEY or OPENAI_API_KEY is missing from the root .env file.' })
    return
  }

  try {
    const aiStartedAt = nowMs()
    const refinementPrompt = await generateRefinementPrompt({
      productQuery: normalizedQuery,
      anthropicApiKey,
      openAiApiKey,
      haikuModel: getHaikuRefinementModel(),
      model: getRefinementModel(),
    })
    const aiDuration = nowMs() - aiStartedAt
    const totalDuration = nowMs() - requestStartedAt

    logSearchFlowEvent('guided_refine_completed', {
      route: '/api/search/refine',
      lane: 'question_fast',
      query: normalizedQuery,
      promptLength: refinementPrompt.prompt.length,
      helperTextLength: refinementPrompt.helperText.length,
      placeholderLength: refinementPrompt.followUpPlaceholder.length,
      queryFramingCategoryHint: refinementPrompt.queryFraming?.categoryHint || '',
      queryFramingAxisCount: Array.isArray(refinementPrompt.queryFraming?.tradeoffAxes)
        ? refinementPrompt.queryFraming.tradeoffAxes.length
        : 0,
      aiMs: roundTimingDuration(aiDuration),
      totalMs: roundTimingDuration(totalDuration),
      aiUsage: refinementPrompt.usage || null,
      aiProvider: refinementPrompt.provider || '',
      aiModel: refinementPrompt.model || '',
      fallbackFrom: refinementPrompt.fallbackFrom || null,
      queryFramingMode: refinementPrompt.queryFramingMode || 'legacy_query_framing',
      rankingOwner: refinementPrompt.provider === 'anthropic' ? 'haiku_question_fast' : 'openai_question_fast',
    })

    sendJson(response, 200, refinementPrompt, {
      serverTiming: [
        { name: refinementPrompt.provider === 'anthropic' ? 'haiku' : 'openai', duration: aiDuration },
        { name: 'total', duration: totalDuration },
      ],
    })
  } catch (error) {
    logSearchFlowEvent('guided_refine_failed', {
      route: '/api/search/refine',
      query: normalizedQuery,
      totalMs: roundTimingDuration(nowMs() - requestStartedAt),
      error: error instanceof Error ? error.message : 'Unknown error',
    })
    reportBackendError(error, {
      query: normalizedQuery,
      route: '/api/search/refine',
      source: 'guided_refine',
      totalMs: roundTimingDuration(nowMs() - requestStartedAt),
    })
    sendJson(response, 500, buildInternalErrorPayload('Unable to generate the refinement prompt.', error))
  }
}
