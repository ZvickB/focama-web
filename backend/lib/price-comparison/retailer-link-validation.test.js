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

const publicLookup = vi.fn().mockResolvedValue([{ address: '8.8.8.8', family: 4 }])

describe('retailer link validation', () => {
  it('normalizes configured domains and rejects private network targets', () => {
    expect(parseRetailerDomainAllowlist('https://bestbuy.ca, walmart.ca, bestbuy.ca/path')).toEqual([
      'bestbuy.ca', 'walmart.ca',
    ])
    expect(isPublicIpAddress('127.0.0.1')).toBe(false)
    expect(isPublicIpAddress('10.0.0.1')).toBe(false)
    expect(isPublicIpAddress('8.8.8.8')).toBe(true)
  })

  it('accepts a bounded redirect that remains on the approved retailer domain', async () => {
    const result = await validateDirectRetailerUrl('https://bestbuy.ca/product/one', {
      allowedDomains: ['bestbuy.ca'],
      retailer: 'Best Buy Canada',
      fetchImpl: vi.fn()
        .mockResolvedValueOnce(response(302, 'https://www.bestbuy.ca/en-ca/product/one'))
        .mockResolvedValueOnce(response(200)),
      lookup: publicLookup,
    })

    expect(result).toMatchObject({ ok: true, redirects: [expect.anything()] })
  })

  it('rejects redirects away from the approved retailer even when soft failures are allowed', async () => {
    const result = await validateDirectRetailerUrl('https://bestbuy.ca/product/one', {
      allowedDomains: ['bestbuy.ca'],
      retailer: 'Best Buy',
      fetchImpl: vi.fn().mockResolvedValue(response(302, 'https://google.com/shopping')),
      lookup: publicLookup,
      softAcceptProbeFailures: true,
    })

    expect(result).toMatchObject({ ok: false, reason: 'redirect_left_retailer' })
  })

  it('rejects unapproved domains and retailer/domain identity mismatches', async () => {
    await expect(validateDirectRetailerUrl('https://google.com/shopping', {
      allowedDomains: ['bestbuy.ca'],
      retailer: 'Best Buy',
    })).resolves.toMatchObject({ ok: false, reason: 'unapproved_domain' })
    await expect(validateDirectRetailerUrl('https://bestbuy.ca/product/one', {
      allowedDomains: ['bestbuy.ca', 'walmart.ca'],
      retailer: 'Walmart',
    })).resolves.toMatchObject({ ok: false, reason: 'retailer_domain_mismatch' })
  })

  it('soft-accepts a trusted retailer timeout only after URL and DNS safety checks pass', async () => {
    const result = await validateDirectRetailerUrl('https://bestbuy.com/site/product/one', {
      allowedDomains: ['bestbuy.com'],
      retailer: 'Best Buy',
      fetchImpl: vi.fn().mockRejectedValue(Object.assign(new Error('timeout'), { name: 'TimeoutError' })),
      lookup: publicLookup,
      softAcceptProbeFailures: true,
    })

    expect(result).toMatchObject({ ok: true, reason: 'soft_probe_timeout', verification: 'soft' })
  })
})
