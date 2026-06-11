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
  { countryCode: 'IN', domain: 'amazon.in', label: 'India', pricePrefix: 'INR ' },
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

export const AFFILIATE_SUPPORTED_AMAZON_MARKETPLACES = AMAZON_MARKETPLACES.filter(({ domain }) =>
  hasAmazonAffiliateTag(domain),
)

export function normalizeAffiliateSupportedAmazonDomain(value = '') {
  const normalizedDomain = normalizeAmazonDomain(value)
  return hasAmazonAffiliateTag(normalizedDomain) ? normalizedDomain : ''
}

export function isSupportedAmazonDomain(value = '') {
  return Boolean(normalizeAmazonDomain(value))
}

export function getAmazonDomainFromCountryCode(countryCode = 'US') {
  return COUNTRY_TO_AMAZON_DOMAIN[countryCode] ?? 'amazon.com'
}

export function getAffiliateSupportedAmazonDomainFromCountryCode(countryCode = 'US') {
  const domain = getAmazonDomainFromCountryCode(countryCode)
  return normalizeAffiliateSupportedAmazonDomain(domain) || 'amazon.com'
}

export function getOxylabsDomainFromAmazonDomain(domain = 'amazon.com') {
  const normalizedDomain = normalizeAmazonDomain(domain) || 'amazon.com'
  return normalizedDomain.replace(/^amazon\./, '')
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
  const tag = getAmazonAffiliateTag(normalizedDomain)
  if (!tag) return ''
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
