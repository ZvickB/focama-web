import { tokenize, TOKEN_SYNONYMS } from './retrieval.js'

export function fallbackAnswer(question) {
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

export function labelPassage(passage) {
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

export function deterministicRespond(question, passages) {
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

export function fallbackResult(question) {
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

export function deterministicAnswerResult(question, passages) {
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
