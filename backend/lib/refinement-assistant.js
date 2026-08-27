import { DEFAULT_HAIKU_MODEL, DEFAULT_REFINEMENT_MODEL } from './ai-selector.js'
import { createQuestionOnlyQueryFramingContract, generateQuestionFast, generateQuestionFastHaiku } from './query-framing.js'

const DEFAULT_HELPER_TEXT = ''
const DEFAULT_PLACEHOLDER = 'Budget, size, must-haves, or anything you want to avoid...'

function createFallbackAnswerOptions({ alternate = false } = {}) {
  if (alternate) {
    return [
      { label: 'Too expensive', prompt: 'I want to avoid options that cost too much.' },
      { label: 'Too complicated', prompt: 'I want to avoid options that are complicated to use.' },
      { label: 'Wrong size', prompt: 'I want to avoid options that do not fit my space or needs.' },
      { label: 'Not sure', prompt: 'I am not sure what I want to avoid.' },
    ]
  }

  return [
    { label: 'Best value', prompt: 'I want the best balance of price and fit.' },
    { label: 'Easiest to use', prompt: 'Ease of use matters most to me.' },
    { label: 'Best fit', prompt: 'Fit for my needs matters most to me.' },
    { label: 'No preference', prompt: 'I do not have a preference here.' },
  ]
}

function ensureAnswerOptions(value, fallbackOptions) {
  if (!Array.isArray(value) || value.length < 3) {
    return fallbackOptions
  }

  const options = value.slice(0, 4)
  const hasNeutralOption = options.some((option) =>
    /\b(?:no preference|not sure|nothing specific|no priority)\b/i.test(option?.label || ''),
  )

  if (!hasNeutralOption) {
    const neutralOption = {
      label: 'No preference',
      prompt: 'I do not have a preference here.',
    }

    if (options.length === 4) {
      options[3] = neutralOption
    } else {
      options.push(neutralOption)
    }
  }

  return options
}

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

  if (openAiApiKey) {
    try {
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
    } catch (error) {
      fallbackFrom = model

      if (!anthropicApiKey) {
        throw error
      }
    }
  }

  if (!questionFast) {
    questionFast = await generateQuestionFastHaiku({
      productQuery,
      apiKey: anthropicApiKey,
      model: haikuModel,
    })
  }

  const primaryFallbackOptions = createFallbackAnswerOptions()
  const alternateFallbackOptions = createFallbackAnswerOptions({ alternate: true })
  const hasPrimaryAnswers = Array.isArray(questionFast.refinementSuggestions)
    && questionFast.refinementSuggestions.length >= 3
  const hasAlternateAnswers = Array.isArray(questionFast.alternateRefinementSuggestions)
    && questionFast.alternateRefinementSuggestions.length >= 3

  return {
    prompt: hasPrimaryAnswers
      ? questionFast.prompt
      : `What matters most when choosing your ${productQuery}?`,
    alternatePrompt: hasAlternateAnswers
      ? questionFast.alternatePrompt
      : `What would make a ${productQuery} a poor fit?`,
    answerOptions: ensureAnswerOptions(questionFast.refinementSuggestions, primaryFallbackOptions),
    alternateAnswerOptions: ensureAnswerOptions(
      questionFast.alternateRefinementSuggestions,
      alternateFallbackOptions,
    ),
    refinementSuggestions: questionFast.refinementSuggestions,
    helperText: DEFAULT_HELPER_TEXT,
    followUpPlaceholder: DEFAULT_PLACEHOLDER,
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
