import { describe, expect, it } from 'vitest'

import { formatDisplayPrice } from './formatDisplayPrice.js'

describe('formatDisplayPrice', () => {
  it('formats numeric prices to two decimals while preserving currency text', () => {
    expect(formatDisplayPrice('$19')).toBe('$19.00')
    expect(formatDisplayPrice('CAD 1,299.5')).toBe('CAD 1,299.50')
    expect(formatDisplayPrice('from $24.999 each')).toBe('from $25.00 each')
  })

  it('leaves non-numeric price labels unchanged', () => {
    expect(formatDisplayPrice('Price unavailable')).toBe('Price unavailable')
    expect(formatDisplayPrice('')).toBe('')
    expect(formatDisplayPrice(null)).toBe('')
  })
})
