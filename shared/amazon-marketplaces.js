export const AMAZON_MARKETPLACES = [
  { countryCode: 'US', domain: 'amazon.com', label: 'United States', pricePrefix: '$' },
  { countryCode: 'CA', domain: 'amazon.ca', label: 'Canada', pricePrefix: 'CA$' },
  { countryCode: 'GB', domain: 'amazon.co.uk', label: 'United Kingdom', pricePrefix: 'GBP ' },
  { countryCode: 'DE', domain: 'amazon.de', label: 'Germany', pricePrefix: 'EUR ' },
  { countryCode: 'FR', domain: 'amazon.fr', label: 'France', pricePrefix: 'EUR ' },
  { countryCode: 'IT', domain: 'amazon.it', label: 'Italy', pricePrefix: 'EUR ' },
  { countryCode: 'ES', domain: 'amazon.es', label: 'Spain', pricePrefix: 'EUR ' },
  { countryCode: 'NL', domain: 'amazon.nl', label: 'Netherlands', pricePrefix: 'EUR ' },
  { countryCode: 'SE', domain: 'amazon.se', label: 'Sweden', pricePrefix: 'SEK ' },
  { countryCode: 'PL', domain: 'amazon.pl', label: 'Poland', pricePrefix: 'PLN ' },
  { countryCode: 'BE', domain: 'amazon.com.be', label: 'Belgium', pricePrefix: 'EUR ' },
  { countryCode: 'AT', domain: 'amazon.de', label: 'Austria', pricePrefix: 'EUR ' },
  { countryCode: 'AU', domain: 'amazon.com.au', label: 'Australia', pricePrefix: 'A$' },
  { countryCode: 'SG', domain: 'amazon.sg', label: 'Singapore', pricePrefix: 'S$' },
  { countryCode: 'JP', domain: 'amazon.co.jp', label: 'Japan', pricePrefix: 'JPY ' },
  { countryCode: 'IN', domain: 'amazon.in', label: 'India', pricePrefix: '₹' },
  { countryCode: 'MX', domain: 'amazon.com.mx', label: 'Mexico', pricePrefix: 'MX$' },
  { countryCode: 'BR', domain: 'amazon.com.br', label: 'Brazil', pricePrefix: 'R$' },
  { countryCode: 'AE', domain: 'amazon.ae', label: 'United Arab Emirates', pricePrefix: 'AED ' },
  { countryCode: 'SA', domain: 'amazon.sa', label: 'Saudi Arabia', pricePrefix: 'SAR ' },
  { countryCode: 'EG', domain: 'amazon.eg', label: 'Egypt', pricePrefix: 'EGP ' },
  { countryCode: 'TR', domain: 'amazon.com.tr', label: 'Turkey', pricePrefix: 'TRY ' },
]

const DOMAIN_TO_AFFILIATE_TAG = {
  'amazon.com': 'focamai-20',
  'amazon.ca': 'focamai4203-20',
}

// This marketplace has a verified US OneLink tracking-ID preference. We retain its selected
// local marketplace for search and UI, but use a US-tagged ASIN link for clickout so Amazon can
// apply its configured local-store redirect and commission attribution.
const ONELINK_AMAZON_DOMAINS = new Set([
  'amazon.co.uk',
])

// Major marketplaces enabled without a direct Associates tag. The remaining domains stay local
// and untagged until a verified OneLink tracking-ID preference or direct store-specific tag exists.
const ACTIVE_UNTAGGED_AMAZON_DOMAINS = new Set([
  'amazon.co.uk',
  'amazon.de',
  'amazon.fr',
  'amazon.it',
  'amazon.es',
  'amazon.nl',
  'amazon.pl',
  'amazon.se',
  'amazon.com.au',
  'amazon.co.jp',
  'amazon.in',
  'amazon.com.mx',
  'amazon.com.br',
])

const COUNTRY_TO_AMAZON_DOMAIN = Object.fromEntries(
  AMAZON_MARKETPLACES.map(({ countryCode, domain }) => [countryCode, domain]),
)
const DOMAIN_TO_PRICE_PREFIX = Object.fromEntries(
  AMAZON_MARKETPLACES.map(({ domain, pricePrefix }) => [domain, pricePrefix]),
)

const SUPPORTED_AMAZON_DOMAINS = new Set(AMAZON_MARKETPLACES.map(({ domain }) => domain))

export function normalizeAmazonDomain(value = '') {
  if (typeof value !== 'string') {
    return ''
  }

  const normalized = value.trim().toLowerCase()
  return SUPPORTED_AMAZON_DOMAINS.has(normalized) ? normalized : ''
}

export function getAmazonAffiliateTag(domain = 'amazon.com') {
  const normalizedDomain = normalizeAmazonDomain(domain)
  return normalizedDomain ? DOMAIN_TO_AFFILIATE_TAG[normalizedDomain] || '' : ''
}

export function hasAmazonAffiliateTag(domain = 'amazon.com') {
  return Boolean(getAmazonAffiliateTag(domain))
}

export function isActiveAmazonDomain(domain = '') {
  const normalizedDomain = normalizeAmazonDomain(domain)
  if (!normalizedDomain) {
    return false
  }
  return hasAmazonAffiliateTag(normalizedDomain) || ACTIVE_UNTAGGED_AMAZON_DOMAINS.has(normalizedDomain)
}

export const ACTIVE_AMAZON_MARKETPLACES = AMAZON_MARKETPLACES.filter(({ domain }) =>
  isActiveAmazonDomain(domain),
)

export function normalizeActiveAmazonDomain(value = '') {
  const normalizedDomain = normalizeAmazonDomain(value)
  return isActiveAmazonDomain(normalizedDomain) ? normalizedDomain : ''
}

export function isSupportedAmazonDomain(value = '') {
  return Boolean(normalizeAmazonDomain(value))
}

export function getAmazonDomainFromCountryCode(countryCode = 'US') {
  return COUNTRY_TO_AMAZON_DOMAIN[countryCode] ?? 'amazon.com'
}

export function getActiveAmazonDomainFromCountryCode(countryCode = 'US') {
  const domain = getAmazonDomainFromCountryCode(countryCode)
  return normalizeActiveAmazonDomain(domain) || 'amazon.com'
}

export function buildAmazonBaseUrl(domain = 'amazon.com') {
  const normalizedDomain = normalizeAmazonDomain(domain) || 'amazon.com'
  return `https://www.${normalizedDomain}`
}

export function getAmazonPricePrefix(domain = 'amazon.com') {
  const normalizedDomain = normalizeAmazonDomain(domain) || 'amazon.com'
  return DOMAIN_TO_PRICE_PREFIX[normalizedDomain] || '$'
}

export function appendAffiliateTag(url, domain = 'amazon.com') {
  if (!url) return url
  const normalizedDomain = normalizeAmazonDomain(domain)
  if (!isActiveAmazonDomain(normalizedDomain)) return ''
  const tag = getAmazonAffiliateTag(normalizedDomain)
  try {
    const u = new URL(url)
    const urlDomain = u.hostname.toLowerCase().replace(/^www\./, '')
    const normalizedUrlDomain = normalizeAmazonDomain(urlDomain)
    if (!normalizedUrlDomain) {
      return url
    }
    if (normalizedUrlDomain && normalizedUrlDomain !== normalizedDomain) {
      return ''
    }
    if (!tag && ONELINK_AMAZON_DOMAINS.has(normalizedDomain)) {
      const asin = u.pathname.match(/\/(?:dp|gp\/product)\/([A-Z0-9]{10})(?:[/?]|$)/i)?.[1]
      if (asin) {
        const oneLinkUrl = new URL(`https://www.amazon.com/dp/${asin}`)
        oneLinkUrl.searchParams.set('tag', DOMAIN_TO_AFFILIATE_TAG['amazon.com'])
        return oneLinkUrl.toString()
      }
    }
    if (!tag) {
      return u.toString()
    }
    u.searchParams.set('tag', tag)
    return u.toString()
  } catch {
    return ''
  }
}

export function formatAmazonPrice(value, domain = 'amazon.com') {
  if (!Number.isFinite(value)) {
    return null
  }

  return `${getAmazonPricePrefix(domain)}${value}`
}
