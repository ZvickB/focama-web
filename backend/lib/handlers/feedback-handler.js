import { readJsonBody, sendJson } from '../http.js'
import { recordTesterFeedback } from '../search-storage.js'
import { sanitizeAnalyticsEventData, truncateText } from '../text-sanitizers.js'

function sanitizeFeedbackChoice(value) {
  const normalizedValue = truncateText(value, 20).toLowerCase()

  if (normalizedValue === 'yes' || normalizedValue === 'partly' || normalizedValue === 'no') {
    return normalizedValue
  }

  return ''
}

function sanitizeOptionalEmail(value, maxLength) {
  const normalizedValue = truncateText(value, maxLength).toLowerCase()

  if (!normalizedValue) {
    return ''
  }

  const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
  return emailPattern.test(normalizedValue) ? normalizedValue : null
}

export function createFeedbackHandler({
  bodyLimitBytes,
  maxEmailLength,
  maxFreeTextLength,
  maxPageLength,
  maxQueryLength,
  maxSearchIdLength,
  maxSelectedProductIdLength,
  maxSessionIdLength,
  maxStageLength,
}) {
  return async function handleFeedbackSubmission(request, response) {
    let body

    try {
      body = await readJsonBody(request, { maxBytes: bodyLimitBytes })
    } catch (error) {
      sendJson(response, 400, { error: error instanceof Error ? error.message : 'Invalid request body.' })
      return
    }

    const email = sanitizeOptionalEmail(body?.email, maxEmailLength)

    if (email === null) {
      sendJson(response, 400, { error: 'Enter a valid email address or leave it blank.' })
      return
    }

    const feedback = {
      email: email || null,
      finalized: Boolean(body?.finalized),
      foundWhatYouWanted: sanitizeFeedbackChoice(body?.foundWhatYouWanted),
      freeText: truncateText(body?.freeText, maxFreeTextLength),
      enjoyedExperience: sanitizeFeedbackChoice(body?.enjoyedExperience),
      page: truncateText(body?.page, maxPageLength) || '/',
      queryText: truncateText(body?.queryText, maxQueryLength),
      resultsSeen: Boolean(body?.resultsSeen),
      searchId: truncateText(body?.searchId, maxSearchIdLength),
      selectedProductId: truncateText(body?.selectedProductId, maxSelectedProductIdLength),
      sessionId: truncateText(body?.sessionId, maxSessionIdLength),
      stageReached: truncateText(body?.stageReached, maxStageLength) || 'home',
      wasSimple: sanitizeFeedbackChoice(body?.wasSimple),
    }

    const hasStructuredAnswer = Boolean(
      feedback.wasSimple ||
      feedback.foundWhatYouWanted ||
      feedback.enjoyedExperience ||
      feedback.freeText ||
      feedback.email,
    )

    if (!hasStructuredAnswer) {
      sendJson(response, 400, { error: 'Add at least one answer before sending feedback.' })
      return
    }

    await recordTesterFeedback({
      ...feedback,
      metadata: sanitizeAnalyticsEventData(body?.metadata),
    })

    sendJson(response, 202, { ok: true })
  }
}
