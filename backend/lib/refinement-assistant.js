import { DEFAULT_HAIKU_MODEL, DEFAULT_REFINEMENT_MODEL } from './ai-selector.js'
import { createQuestionOnlyQueryFramingContract, generateQuestionFast, generateQuestionFastHaiku } from './query-framing.js'

const DEFAULT_HELPER_TEXT = 'Or write whatever is important to you. Feel free to write in natural language.'
const DEFAULT_PLACEHOLDER = 'Example: I want something lightweight for daily travel, under $200, and easy to clean.'

export async function generateRefinementPrompt(
  {
    productQuery,
    anthropicApiKey = '',
    apiKey = '',
    openAiApiKey = apiKey,
    haikuModel = DEFAULT_HAIKU_MODEL,
    model = DEFAULT_REFINEMENT_MODEL,
  },
  fetchImpl = fetch,
) {
  let questionFast
  let fallbackFrom = null

  if (anthropicApiKey) {
    try {
      questionFast = await generateQuestionFastHaiku({
        productQuery,
        apiKey: anthropicApiKey,
        model: haikuModel,
      })
    } catch (error) {
      fallbackFrom = haikuModel

      if (!openAiApiKey) {
        throw error
      }
    }
  }

  if (!questionFast) {
    questionFast = await generateQuestionFast(
      {
        productQuery,
        apiKey: openAiApiKey,
        model,
      },
      fetchImpl,
    )
    questionFast = {
      ...questionFast,
      model,
      provider: 'openai',
    }
  }

  return {
    prompt: questionFast.prompt,
    helperText: DEFAULT_HELPER_TEXT,
    followUpPlaceholder: DEFAULT_PLACEHOLDER,
    refinementSuggestions: questionFast.refinementSuggestions,
    usage: questionFast.usage,
    provider: questionFast.provider,
    model: questionFast.model,
    fallbackFrom,
    queryFraming: createQuestionOnlyQueryFramingContract({
      productQuery,
      generatedAt: questionFast.generatedAt,
    }),
    queryFramingMode: 'question_fast',
  }
}
