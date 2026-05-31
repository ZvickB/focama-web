import { describe, expect, it } from 'vitest'

import { getProductDisplayTitle, truncateProductTitleAtWord } from './productTitle.js'

describe('product title display helpers', () => {
  it('keeps short comma titles intact', () => {
    expect(getProductDisplayTitle('Sony WH-1000XM5, Wireless Noise Canceling Headphones')).toBe(
      'Sony WH-1000XM5, Wireless Noise Canceling Headphones',
    )
  })

  it('keeps the first comma chunk for long keyword-stuffed titles', () => {
    expect(
      getProductDisplayTitle(
        'Bedsure Queen Comforter Set, Beige Tufted Bed in a Bag, Soft Bedding for All Seasons, 7 Pieces',
      ),
    ).toBe('Bedsure Queen Comforter Set')
  })

  it('truncates long titles at a word boundary', () => {
    expect(
      truncateProductTitleAtWord(
        'UltraSoft Memory Foam Seat Cushion for Office Chairs and Long Work Sessions With Washable Cover',
        42,
      ),
    ).toBe('UltraSoft Memory Foam Seat Cushion for...')
  })
})
