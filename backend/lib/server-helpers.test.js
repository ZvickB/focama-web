import { describe, it, expect, vi, beforeEach } from 'vitest'

// These tests pin current behavior of helpers before they move out of server.js.

describe('server-helpers characterization tests', () => {
  let helpers

  beforeEach(async () => {
    helpers = await import('./server-helpers.js')
  })

  describe('nowMs', () => {
    it('returns a numeric value from performance.now', () => {
      const result = helpers.nowMs()
      expect(typeof result).toBe('number')
      expect(result).toBeGreaterThan(0)
    })
  })

  describe('roundTimingDuration', () => {
    it('rounds to one decimal place', () => {
      expect(helpers.roundTimingDuration(1.234)).toBe(1.2)
      expect(helpers.roundTimingDuration(1.25)).toBe(1.3)
      expect(helpers.roundTimingDuration(0)).toBe(0)
    })
  })

  describe('clampInteger', () => {
    it('returns default when value is not finite', () => {
      expect(helpers.clampInteger('abc', { defaultValue: 5, min: 0, max: 10 })).toBe(5)
      expect(helpers.clampInteger(undefined, { defaultValue: 5, min: 0, max: 10 })).toBe(5)
      expect(helpers.clampInteger(NaN, { defaultValue: 5, min: 0, max: 10 })).toBe(5)
    })

    it('clamps to min/max range', () => {
      expect(helpers.clampInteger(-5, { defaultValue: 0, min: 0, max: 10 })).toBe(0)
      expect(helpers.clampInteger(15, { defaultValue: 0, min: 0, max: 10 })).toBe(10)
      expect(helpers.clampInteger(5, { defaultValue: 0, min: 0, max: 10 })).toBe(5)
    })

    it('rounds to nearest integer', () => {
      expect(helpers.clampInteger(5.7, { defaultValue: 0, min: 0, max: 10 })).toBe(6)
    })
  })

  describe('readHeaderValue', () => {
    it('returns string header value', () => {
      expect(helpers.readHeaderValue({ 'x-test': 'hello' }, 'x-test')).toBe('hello')
    })

    it('returns first element of array header', () => {
      expect(helpers.readHeaderValue({ 'x-test': ['first', 'second'] }, 'x-test')).toBe('first')
    })

    it('returns empty string for missing header', () => {
      expect(helpers.readHeaderValue({}, 'x-test')).toBe('')
    })

    it('returns empty string for non-string value', () => {
      expect(helpers.readHeaderValue({ 'x-test': 123 }, 'x-test')).toBe('')
    })

    it('returns empty string for empty array', () => {
      expect(helpers.readHeaderValue({ 'x-test': [] }, 'x-test')).toBe('')
    })
  })

  describe('isLocalhostHost', () => {
    it('detects localhost variants', () => {
      expect(helpers.isLocalhostHost('localhost')).toBe(true)
      expect(helpers.isLocalhostHost('localhost:3000')).toBe(true)
      expect(helpers.isLocalhostHost('127.0.0.1')).toBe(true)
      expect(helpers.isLocalhostHost('127.0.0.1:8080')).toBe(true)
      expect(helpers.isLocalhostHost('::1')).toBe(true)
      expect(helpers.isLocalhostHost('[::1]:8080')).toBe(true)
    })

    it('rejects non-localhost hosts', () => {
      expect(helpers.isLocalhostHost('example.com')).toBe(false)
      expect(helpers.isLocalhostHost('')).toBe(false)
    })
  })

  describe('getRequestedAmazonDomain', () => {
    it('returns empty for empty input', () => {
      expect(helpers.getRequestedAmazonDomain('')).toBeFalsy()
    })

    it('returns active supported Amazon domains without configured affiliate tags', () => {
      expect(helpers.getRequestedAmazonDomain('amazon.co.uk')).toBe('amazon.co.uk')
    })
  })

  describe('getAmazonMarketplaceScope', () => {
    it('returns scope without domain suffix when domain is empty', () => {
      expect(helpers.getAmazonMarketplaceScope('guided_discovery', '')).toBe('guided_discovery')
    })

    it('appends normalized tagged domain when provided', () => {
      const result = helpers.getAmazonMarketplaceScope('guided_discovery', 'amazon.ca')
      expect(result).toBe('guided_discovery:amazon.ca')
    })

    it('appends active untagged marketplace domains', () => {
      const result = helpers.getAmazonMarketplaceScope('guided_discovery', 'amazon.co.uk')
      expect(result).toBe('guided_discovery:amazon.co.uk')
    })
  })

  describe('resolveAmazonDomain', () => {
    it('defaults to US domain when no arguments', () => {
      const result = helpers.resolveAmazonDomain()
      expect(result).toBe('amazon.com')
    })

    it('uses tagged body amazonDomain when provided', () => {
      const result = helpers.resolveAmazonDomain({ body: { amazonDomain: 'amazon.ca' } })
      expect(result).toBe('amazon.ca')
    })

    it('uses an active untagged country domain', () => {
      const result = helpers.resolveAmazonDomain({ countryCode: 'GB' })
      expect(result).toBe('amazon.co.uk')
    })
  })

  describe('runInBackground', () => {
    it('executes a function without blocking', async () => {
      const fn = vi.fn()
      helpers.runInBackground(fn)
      await new Promise((r) => setTimeout(r, 10))
      expect(fn).toHaveBeenCalled()
    })
  })

  describe('logSearchFlowEvent', () => {
    it('does not throw in test environment', () => {
      expect(() => helpers.logSearchFlowEvent('test_event', { key: 'value' })).not.toThrow()
    })
  })
})
