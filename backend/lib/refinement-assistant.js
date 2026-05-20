import { DEFAULT_REFINEMENT_MODEL } from './ai-selector.js'
import { createQuestionOnlyQueryFramingContract, generateQuestionFast } from './query-framing.js'

const DEFAULT_HELPER_TEXT = 'Or write whatever is important to you. Feel free to write in natural language.'
const DEFAULT_PLACEHOLDER = 'Example: I want something lightweight for daily travel, under $200, and easy to clean.'

export async function generateRefinementPrompt(
  { productQuery, apiKey, claudeApiKey, model = DEFAULT_REFINEMENT_MODEL },
  fetchImpl = fetch,
) {
  const questionFast = await generateQuestionFast(
    {
      productQuery,
      apiKey,
      claudeApiKey,
      model,
    },
    fetchImpl,
  )

  return {
    prompt: questionFast.prompt,
    helperText: DEFAULT_HELPER_TEXT,
    followUpPlaceholder: DEFAULT_PLACEHOLDER,
    refinementSuggestions: questionFast.refinementSuggestions,
    usage: questionFast.usage,
    queryFraming: createQuestionOnlyQueryFramingContract({
      productQuery,
      generatedAt: questionFast.generatedAt,
    }),
    queryFramingMode: 'question_fast',
  }
}
