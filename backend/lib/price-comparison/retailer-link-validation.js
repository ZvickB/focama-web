import { lookup as dnsLookup } from 'node:dns/promises'
import { isIP } from 'node:net'

function clean(value) {
  return String(value || '').trim().toLowerCase()
}

export function parseRetailerDomainAllowlist(value) {
  return [...new Set(String(value || '')
    .split(',')
    .map((entry) => clean(entry).replace(/^https?:\/\//, '').replace(/\/.*$/, '').replace(/^\./, ''))
    .filter(Boolean))]
}

function domainMatches(hostname, allowedDomain) {
  return hostname === allowedDomain || hostname.endsWith(`.${allowedDomain}`)
}

export function findAllowedRetailerDomain(hostname, allowedDomains) {
  const host = clean(hostname).replace(/\.$/, '')
  return (Array.isArray(allowedDomains) ? allowedDomains : []).find((domain) => domainMatches(host, clean(domain))) || ''
}

function retailerMatchesDomain(retailer, domain) {
  const retailerKey = clean(retailer)
    .replace(/\b(?:the|canada|usa|us|official|store|marketplace)\b/g, '')
    .replace(/[^a-z0-9]+/g, '')
  const domainKey = clean(domain).split('.')[0].replace(/[^a-z0-9]+/g, '')
  return Boolean(retailerKey && domainKey && (retailerKey.includes(domainKey) || domainKey.includes(retailerKey)))
}

function buildSoftVerifiedResult({ allowedDomain, current, reason, redirects = [], status = null }) {
  return {
    allowedDomain,
    finalUrl: current.toString(),
    ok: true,
    reason: `soft_${reason}`,
    redirects,
    status,
    verification: 'soft',
  }
}

function isPrivateIpv4(address) {
  const parts = address.split('.').map(Number)
  if (parts.length !== 4 || parts.some((part) => !Number.isInteger(part))) return true
  return parts[0] === 10 || parts[0] === 127 || parts[0] === 0 ||
    (parts[0] === 169 && parts[1] === 254) ||
    (parts[0] === 172 && parts[1] >= 16 && parts[1] <= 31) ||
    (parts[0] === 192 && parts[1] === 168) || parts[0] >= 224
}

function isPrivateIpv6(address) {
  const normalized = clean(address)
  return normalized === '::1' || normalized === '::' || normalized.startsWith('fc') ||
    normalized.startsWith('fd') || normalized.startsWith('fe8') || normalized.startsWith('fe9') ||
    normalized.startsWith('fea') || normalized.startsWith('feb')
}

export function isPublicIpAddress(address) {
  const version = isIP(address)
  if (version === 4) return !isPrivateIpv4(address)
  if (version === 6) return !isPrivateIpv6(address)
  return false
}

async function resolvePublicHost(hostname, lookup = dnsLookup) {
  if (isIP(hostname)) return isPublicIpAddress(hostname)
  const addresses = await lookup(hostname, { all: true, verbatim: true })
  return Array.isArray(addresses) && addresses.length > 0 && addresses.every((entry) => isPublicIpAddress(entry?.address || ''))
}

async function cancelBody(response) {
  try {
    await response?.body?.cancel?.()
  } catch {
    // The headers and destination are all this validation needs.
  }
}

export async function validateDirectRetailerUrl(value, {
  allowedDomains,
  retailer = '',
  fetchImpl = fetch,
  lookup = dnsLookup,
  timeoutMs = 2000,
  maxRedirects = 3,
  softAcceptProbeFailures = false,
} = {}) {
  const domains = Array.isArray(allowedDomains) ? allowedDomains.map(clean).filter(Boolean) : []
  if (!domains.length) return { ok: false, reason: 'allowlist_missing', finalUrl: '' }

  let current
  try {
    current = new URL(String(value || ''))
  } catch {
    return { ok: false, reason: 'invalid_url', finalUrl: '' }
  }

  if (current.protocol !== 'https:' || current.username || current.password) {
    return { ok: false, reason: 'unsafe_url', finalUrl: '' }
  }
  const allowedDomain = findAllowedRetailerDomain(current.hostname, domains)
  if (!allowedDomain) return { ok: false, reason: 'unapproved_domain', finalUrl: '' }
  if (!retailerMatchesDomain(retailer, allowedDomain)) {
    return { ok: false, reason: 'retailer_domain_mismatch', finalUrl: current.toString() }
  }

  const redirects = []
  for (let index = 0; index <= maxRedirects; index += 1) {
    if (!findAllowedRetailerDomain(current.hostname, [allowedDomain])) {
      return { ok: false, reason: 'redirect_left_retailer', finalUrl: current.toString(), redirects }
    }
    if (!await resolvePublicHost(current.hostname, lookup)) {
      return { ok: false, reason: 'non_public_destination', finalUrl: current.toString(), redirects }
    }

    let response
    try {
      response = await fetchImpl(current, {
        method: 'GET',
        redirect: 'manual',
        headers: { Range: 'bytes=0-0', 'User-Agent': 'Focamai-Link-Validator/1.0' },
        signal: AbortSignal.timeout(timeoutMs),
      })
    } catch (error) {
      if (softAcceptProbeFailures) {
        return buildSoftVerifiedResult({
          allowedDomain,
          current,
          reason: error?.name === 'TimeoutError' ? 'probe_timeout' : 'probe_failed',
          redirects,
        })
      }
      return {
        ok: false,
        reason: error?.name === 'TimeoutError' ? 'probe_timeout' : 'probe_failed',
        finalUrl: current.toString(),
        redirects,
      }
    }

    await cancelBody(response)
    if (response.status >= 200 && response.status < 300) {
      return { ok: true, reason: 'verified', finalUrl: current.toString(), status: response.status, redirects, allowedDomain, verification: 'hard' }
    }
    if (response.status < 300 || response.status >= 400) {
      if (softAcceptProbeFailures && [401, 403, 405, 406, 429].includes(response.status)) {
        return buildSoftVerifiedResult({
          allowedDomain,
          current,
          reason: 'probe_status',
          redirects,
          status: response.status,
        })
      }
      return { ok: false, reason: 'probe_status', finalUrl: current.toString(), status: response.status, redirects }
    }
    if (index >= maxRedirects) {
      return { ok: false, reason: 'too_many_redirects', finalUrl: current.toString(), status: response.status, redirects }
    }

    const location = response.headers?.get?.('location')
    if (!location) return { ok: false, reason: 'redirect_missing_location', finalUrl: current.toString(), redirects }
    const next = new URL(location, current)
    if (next.protocol !== 'https:' || next.username || next.password) {
      return { ok: false, reason: 'unsafe_redirect', finalUrl: next.toString(), redirects }
    }
    redirects.push({ from: current.toString(), to: next.toString(), status: response.status })
    current = next
  }

  return { ok: false, reason: 'probe_failed', finalUrl: current.toString(), redirects }
}
