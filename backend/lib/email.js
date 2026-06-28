import { Resend } from 'resend'
import { getEnv } from './search-data.js'

let resendInstance = null

function getResendClient() {
  if (!resendInstance) {
    const apiKey = getEnv('RESEND_API_KEY')
    if (!apiKey) {
      throw new Error('RESEND_API_KEY is not configured.')
    }
    resendInstance = new Resend(apiKey)
  }
  return resendInstance
}

/**
 * Send an email via Resend.
 * @param {{ to: string | string[], subject: string, html: string, from?: string }} options
 * @returns {Promise<{ id: string }>}
 */
export async function sendEmail({ to, subject, html, from }) {
  const resend = getResendClient()
  const fromEmail = from || getEnv('RESEND_FROM_EMAIL') || 'notifications@focamai.com'

  const result = await resend.emails.send({
    from: `Focamai <${fromEmail}>`,
    to,
    subject,
    html,
  })

  if (result.error) {
    throw new Error(result.error.message || 'Resend API returned an error.')
  }

  return { id: result.data?.id }
}
