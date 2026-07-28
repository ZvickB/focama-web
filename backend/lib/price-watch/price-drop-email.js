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

function normalizeHttpsUrl(value) {
  const url = normalizeText(value)

  try {
    return new URL(url).protocol === 'https:' ? url : ''
  } catch {
    return ''
  }
}

export function getPriceDropSummary(oldPrice, newPrice) {
  const previous = normalizePositiveNumber(oldPrice)
  const current = normalizePositiveNumber(newPrice)

  if (!previous || !current || current >= previous) {
    return { amount: 0, percentage: 0 }
  }

  return {
    amount: Math.round((previous - current) * 100) / 100,
    percentage: Math.round(((previous - current) / previous) * 100),
  }
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
  imageUrl = '',
  productTitle = 'Watched product',
  productUrl = '',
} = {}) {
  const title = escapeHtml(productTitle || 'Watched product')
  const oldPriceText = escapeHtml(formatPriceWatchMoney(oldPrice, currency))
  const newPriceText = escapeHtml(formatPriceWatchMoney(newPrice, currency))
  const image = normalizeHttpsUrl(imageUrl)
  const savings = getPriceDropSummary(oldPrice, newPrice)
  const savingsText = savings.amount && savings.percentage
    ? `Save ${escapeHtml(formatPriceWatchMoney(savings.amount, currency))} (${savings.percentage}%)`
    : ''
  const safeProductUrl = escapeHtml(productUrl)
  const safeManageUrl = escapeHtml(manageUrl || DEFAULT_MANAGE_URL)

  return `<!doctype html>
<html>
  <body style="margin:0;background:#f8f5ef;color:#172033;font-family:Arial,Helvetica,sans-serif;">
    <div style="max-width:560px;margin:0 auto;padding:36px 18px;">
      <div style="background:#ffffff;border:1px solid #eadfce;border-radius:18px;padding:28px 24px;">
        <p style="margin:0 0 10px;color:#0f6175;font-size:12px;font-weight:700;letter-spacing:0.12em;text-transform:uppercase;">Price watch</p>
        <h1 style="margin:0;color:#172033;font-size:26px;line-height:1.25;letter-spacing:-0.02em;">Price dropped!</h1>
        <p style="margin:8px 0 22px;color:#64748b;font-size:15px;line-height:1.55;">The price of an item you’re watching just went down.</p>
        <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="border-collapse:collapse;margin:0 0 22px;">
          <tr>
            ${image ? `<td width="88" valign="top" style="padding:0 16px 0 0;"><img src="${escapeHtml(image)}" alt="${title}" width="88" height="88" style="display:block;width:88px;height:88px;border:1px solid #eadfce;border-radius:12px;object-fit:contain;background:#fbf8f3;" /></td>` : ''}
            <td valign="middle"><p style="margin:0;color:#334155;font-size:16px;line-height:1.45;font-weight:600;">${title}</p></td>
          </tr>
        </table>
        <div style="margin:0 0 24px;padding:18px 20px;border:1px solid #dbecea;border-radius:14px;background:#f3f9f8;">
          <p style="margin:0 0 3px;color:#55717a;font-size:13px;font-weight:600;">Now</p>
          <p style="margin:0;color:#0f6175;font-size:38px;line-height:1.05;font-weight:800;letter-spacing:-0.035em;">${newPriceText}</p>
          <p style="margin:12px 0 0;color:#64748b;font-size:14px;line-height:1.45;">Previously <span style="text-decoration:line-through;">${oldPriceText}</span></p>
          ${savingsText ? `<p style="margin:7px 0 0;color:#0f6175;font-size:14px;font-weight:700;">↓ ${savings.percentage}% &nbsp;·&nbsp; ${savingsText}</p>` : ''}
        </div>
        ${safeProductUrl ? `<a href="${safeProductUrl}" style="display:inline-block;background:#e59b26;color:#172033;text-decoration:none;border-radius:12px;padding:13px 18px;font-size:15px;font-weight:700;">View on Amazon</a>` : ''}
        <p style="margin:24px 0 0;color:#64748b;font-size:13px;line-height:1.6;">We’ll let you know if the price drops again.</p>
        <p style="margin:8px 0 0;color:#64748b;font-size:13px;line-height:1.6;">Manage your <a href="${safeManageUrl}" style="color:#0f6175;text-decoration:underline;">price alerts anytime</a>.</p>
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
    imageUrl,
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
        imageUrl,
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
