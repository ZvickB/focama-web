import { Resend } from 'resend'

import { getEnv } from '../search-data.js'

const DEFAULT_MANAGE_URL = 'https://focamai.com/watches'
const DEFAULT_FROM_EMAIL = 'contact@focamai.com'

let resendClient = null

function normalizeText(value, maxLength = 1000) {
  return typeof value === 'string' ? value.trim().slice(0, maxLength) : ''
}

function normalizePositiveNumber(value) {
  const numericValue = Number(value)
  return Number.isFinite(numericValue) && numericValue > 0 ? numericValue : null
}

function escapeHtml(value) {
  return normalizeText(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

export function getPriceWatchEmailConfig(env = process.env) {
  const fromEmail =
    normalizeText(env.PRICE_WATCH_FROM_EMAIL || getEnv('PRICE_WATCH_FROM_EMAIL')) ||
    normalizeText(env.RESEND_FROM_EMAIL || getEnv('RESEND_FROM_EMAIL')) ||
    DEFAULT_FROM_EMAIL
  const manageUrl =
    normalizeText(env.PRICE_WATCH_MANAGE_URL || getEnv('PRICE_WATCH_MANAGE_URL')) ||
    DEFAULT_MANAGE_URL

  return {
    from: `Focamai <${fromEmail}>`,
    manageUrl,
  }
}

export function formatPriceWatchMoney(value, currency = 'USD') {
  const numericValue = normalizePositiveNumber(value)
  if (!numericValue) return ''

  return new Intl.NumberFormat(currency === 'CAD' ? 'en-CA' : 'en-US', {
    currency: currency === 'CAD' ? 'CAD' : 'USD',
    style: 'currency',
  }).format(numericValue)
}

export function renderPriceDropEmail({
  currency = 'USD',
  manageUrl = DEFAULT_MANAGE_URL,
  newPrice,
  oldPrice,
  productTitle = 'Watched product',
  productUrl = '',
} = {}) {
  const title = escapeHtml(productTitle || 'Watched product')
  const oldPriceText = escapeHtml(formatPriceWatchMoney(oldPrice, currency))
  const newPriceText = escapeHtml(formatPriceWatchMoney(newPrice, currency))
  const safeProductUrl = escapeHtml(productUrl)
  const safeManageUrl = escapeHtml(manageUrl || DEFAULT_MANAGE_URL)

  return `<!doctype html>
<html>
  <body style="margin:0;background:#f8f5ef;color:#172033;font-family:Arial,sans-serif;">
    <div style="max-width:560px;margin:0 auto;padding:28px 18px;">
      <div style="background:#ffffff;border:1px solid #eadfce;border-radius:18px;padding:24px;">
        <p style="margin:0 0 10px;color:#0f6175;font-size:12px;font-weight:700;letter-spacing:0.12em;text-transform:uppercase;">Price Watch</p>
        <h1 style="margin:0;color:#111827;font-size:24px;line-height:1.25;">A watched price dropped</h1>
        <p style="margin:16px 0 0;color:#475569;font-size:15px;line-height:1.6;">${title}</p>
        <div style="margin:22px 0;padding:16px;border-radius:14px;background:#eef7f6;">
          <p style="margin:0;color:#64748b;font-size:13px;">Previous baseline</p>
          <p style="margin:4px 0 12px;color:#334155;font-size:18px;font-weight:700;">${oldPriceText}</p>
          <p style="margin:0;color:#64748b;font-size:13px;">Current price</p>
          <p style="margin:4px 0 0;color:#0f6175;font-size:28px;font-weight:800;">${newPriceText}</p>
        </div>
        ${safeProductUrl ? `<a href="${safeProductUrl}" style="display:inline-block;background:#e59b26;color:#1f2937;text-decoration:none;border-radius:14px;padding:13px 18px;font-size:15px;font-weight:700;">View on Amazon</a>` : ''}
        <p style="margin:22px 0 0;color:#64748b;font-size:13px;line-height:1.6;">Focamai reset this watch baseline to ${newPriceText}, so you will only hear again after a new qualifying drop.</p>
        <p style="margin:16px 0 0;color:#64748b;font-size:13px;line-height:1.6;">
          Manage or pause this alert at <a href="${safeManageUrl}" style="color:#0f6175;">${safeManageUrl}</a>.
        </p>
      </div>
    </div>
  </body>
</html>`
}

export function createResendPriceDropSender({
  apiKey = getEnv('RESEND_API_KEY'),
  resend = null,
} = {}) {
  const client = resend || (() => {
    if (!apiKey) {
      throw new Error('RESEND_API_KEY is not configured.')
    }

    if (!resendClient) {
      resendClient = new Resend(apiKey)
    }

    return resendClient
  })()

  return async function sendPriceDropEmail({
    currency,
    from,
    manageUrl,
    newPrice,
    oldPrice,
    productTitle,
    productUrl,
    to,
  }) {
    const toEmail = normalizeText(to, 320)
    if (!toEmail) {
      throw new Error('A recipient email is required.')
    }

    const subjectPrice = formatPriceWatchMoney(newPrice, currency)
    const result = await client.emails.send({
      from,
      html: renderPriceDropEmail({
        currency,
        manageUrl,
        newPrice,
        oldPrice,
        productTitle,
        productUrl,
      }),
      subject: subjectPrice
        ? `Price drop: ${subjectPrice} for ${normalizeText(productTitle, 80) || 'your watched product'}`
        : `Price drop for ${normalizeText(productTitle, 80) || 'your watched product'}`,
      to: toEmail,
    })

    if (result?.error) {
      throw new Error(result.error.message || 'Resend API returned an error.')
    }

    return {
      id: result?.data?.id || '',
    }
  }
}
