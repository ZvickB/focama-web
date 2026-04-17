import { describe, expect, it } from 'vitest'
import { getAmazonDomain } from './rainforest-pipeline.js'

describe('getAmazonDomain', () => {
  it('returns the correct domain for known countries and falls back to amazon.com for unknown ones', () => {
    expect(getAmazonDomain('GB')).toBe('amazon.co.uk')
    expect(getAmazonDomain('DE')).toBe('amazon.de')
    expect(getAmazonDomain('US')).toBe('amazon.com')
    expect(getAmazonDomain('ZZ')).toBe('amazon.com')
  })
})
