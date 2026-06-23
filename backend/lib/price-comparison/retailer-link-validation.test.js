import { describe, expect, it, vi } from 'vitest'
import {
  isPublicIpAddress,
  parseRetailerDomainAllowlist,
  validateDirectRetailerUrl,
} from './retailer-link-validation.js'

function response(status, location = '') {
  return {
    status,
    headers: { get: vi.fn((name) => name === 'location' ? location : null) },
    body: { cancel: vi.fn().mockResolvedValue(undefined) },
  }
}

describe('retailer link validation', () => {
  it('parses and deduplicates configured domains', () => {
    expect(parseRetailerDomainAllowlist('https://bestbuy.ca, walmart.ca, bestbuy.ca/path')).toEqual([
      'bestbuy.ca', 'walmart.ca',
    ])
  })

  it('rejects private and loopback IPs', () => {
    expect(isPublicIpAddress('127.0.0.1')).toBe(false)
    expect(isPublicIpAddress('10.0.0.1')).toBe(false)
    expect(isPublicIpAddress('8.8.8.8')).toBe(true)
  })

  it('accepts a bounded redirect that remains on the approved retailer domain', async () => {
    const fetchImpl = vi.fn()
      .mockResolvedValueOnce(response(302, 'https://www.bestbuy.ca/en-ca/product/one'))
      .mockResolvedValueOnce(response(200))
    const result = await validateDirectRetailerUrl('https://bestbuy.ca/product/one', {
      allowedDomains: ['bestbuy.ca'],
      retailer: 'Best Buy Canada',
      fetchImpl,
      lookup: vi.fn().mockResolvedValue([{ address: '8.8.8.8', family: 4 }]),
    })
    expect(result.ok).toBe(true)
    expect(result.redirects).toHaveLength(1)
  })

  it('rejects redirects away from the approved retailer', async () => {
    const result = await validateDirectRetailerUrl('https://bestbuy.ca/product/one', {
      allowedDomains: ['bestbuy.ca'],
      retailer: 'Best Buy',
      fetchImpl: vi.fn().mockResolvedValue(response(302, 'https://google.com/shopping')),
      lookup: vi.fn().mockResolvedValue([{ address: '8.8.8.8', family: 4 }]),
    })
    expect(result).toEqual(expect.objectContaining({ ok: false, reason: 'redirect_left_retailer' }))
  })

  it('rejects Google, unapproved domains, and retailer bot-block responses', async () => {
    await expect(validateDirectRetailerUrl('https://google.com/shopping', {
      allowedDomains: ['bestbuy.ca'],
      retailer: 'Best Buy',
    })).resolves.toEqual(expect.objectContaining({ ok: false, reason: 'unapproved_domain' }))

    await expect(validateDirectRetailerUrl('https://bestbuy.ca/product/one', {
      allowedDomains: ['bestbuy.ca'],
      retailer: 'Best Buy',
      fetchImpl: vi.fn().mockResolvedValue(response(403)),
      lookup: vi.fn().mockResolvedValue([{ address: '8.8.8.8', family: 4 }]),
    })).resolves.toEqual(expect.objectContaining({ ok: false, reason: 'probe_status', status: 403 }))
  })

  it('soft-accepts trusted retailer probe failures when safety checks pass', async () => {
    const result = await validateDirectRetailerUrl('https://bestbuy.com/site/product/one', {
      allowedDomains: ['bestbuy.com'],
      retailer: 'Best Buy',
      fetchImpl: vi.fn().mockRejectedValue(Object.assign(new Error('timeout'), { name: 'TimeoutError' })),
      lookup: vi.fn().mockResolvedValue([{ address: '8.8.8.8', family: 4 }]),
      softAcceptProbeFailures: true,
    })

    expect(result).toEqual(expect.objectContaining({
      ok: true,
      reason: 'soft_probe_timeout',
      verification: 'soft',
    }))
  })

  it('does not soft-accept redirects away from the retailer domain', async () => {
    const result = await validateDirectRetailerUrl('https://bestbuy.com/site/product/one', {
      allowedDomains: ['bestbuy.com'],
      retailer: 'Best Buy',
      fetchImpl: vi.fn().mockResolvedValue(response(302, 'https://google.com/shopping')),
      lookup: vi.fn().mockResolvedValue([{ address: '8.8.8.8', family: 4 }]),
      softAcceptProbeFailures: true,
    })

    expect(result).toEqual(expect.objectContaining({ ok: false, reason: 'redirect_left_retailer' }))
  })

  it('rejects an approved host that does not agree with the named retailer', async () => {
    await expect(validateDirectRetailerUrl('https://bestbuy.ca/product/one', {
      allowedDomains: ['bestbuy.ca', 'walmart.ca'],
      retailer: 'Walmart',
    })).resolves.toEqual(expect.objectContaining({ ok: false, reason: 'retailer_domain_mismatch' }))
  })
})
