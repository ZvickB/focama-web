function countryFromAcceptLanguage(header) {
  if (!header) return null
  // Take the highest-priority language tag only
  const primary = header.split(',')[0].split(';')[0].trim()
  // e.g. "en-CA" → "CA", "fr-FR" → "FR"
  const parts = primary.split('-')
  if (parts.length >= 2) {
    const region = parts[parts.length - 1].toUpperCase()
    if (/^[A-Z]{2}$/.test(region)) return region
  }
  return null
}

export async function GET(request) {
  const langCountry = countryFromAcceptLanguage(request.headers.get('accept-language'))
  const ipCountry = request.headers.get('x-vercel-ip-country')
  const raw = ipCountry || langCountry
  const countryCode =
    typeof raw === 'string' && /^[A-Z]{2}$/.test(raw.trim()) ? raw.trim() : 'US'

  return new Response(JSON.stringify({ countryCode }), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  })
}
