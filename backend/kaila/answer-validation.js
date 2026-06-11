export const ANSWER_MODES = new Set([
  'direct_answer',
  'multi_fact_answer',
  'ambiguous_question',
  'missing_fact',
  'sensitive_or_confusing_wording',
])

export const ASK_BACK_MODES = new Set(['ambiguous_question', 'sensitive_or_confusing_wording'])

export function isPlainObject(value) {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

export function isAnswerMode(value) {
  return typeof value === 'string' && ANSWER_MODES.has(value)
}

export function validateFollowUpContextForAnswer(value, mode, question, answer) {
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

export function parseAnswerResult(value, question) {
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

export function validatePassageIdList(value, passageIds) {
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

export function validateInterpretations(value, passageIds) {
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

export function validateRejectedPassages(value, passageIds) {
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

export function evidenceCoversRetrievedPassages(interpretations, rejectedPassages, passages) {
  const supportedIds = new Set(interpretations.flatMap((interpretation) => interpretation.supportedPassageIds))
  const rejectedIds = new Set(rejectedPassages.map((rejection) => rejection.passageId))

  for (const supportedId of supportedIds) {
    if (rejectedIds.has(supportedId)) {
      return false
    }
  }

  return passages.every((passage) => supportedIds.has(passage.id) || rejectedIds.has(passage.id))
}

export function citedPassagesAreSupported(citedPassageIds, interpretations) {
  const supportedIds = new Set(interpretations.flatMap((interpretation) => interpretation.supportedPassageIds))
  return citedPassageIds.every((passageId) => supportedIds.has(passageId))
}

export function clarificationFromInterpretations(interpretations, question, customerGoal, rejectedPassages) {
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

export function validateAnswerResult(value, passages, question) {
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
