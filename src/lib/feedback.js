const BACKEND_URL = import.meta.env.VITE_BACKEND_URL || ''

async function readFeedbackResponse(response) {
  const rawBody = await response.text()

  if (response.ok) {
    return rawBody ? JSON.parse(rawBody) : {}
  }

  let payload = {}

  if (rawBody) {
    try {
      payload = JSON.parse(rawBody)
    } catch {
      payload = {}
    }
  }

  throw new Error(payload.error || 'Unable to send feedback right now.')
}

export async function submitTesterFeedback(payload) {
  const response = await fetch(`${BACKEND_URL}/api/feedback`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(payload),
  })

  return readFeedbackResponse(response)
}
