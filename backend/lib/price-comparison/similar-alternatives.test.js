import { describe, expect, it } from 'vitest'

import { findSimilarShoppingAlternatives } from './similar-alternatives.js'

const candidate = {
  brand: 'Fossil',
  numericPrice: 266.57,
  title: "Fossil Women's Raquel Quartz Stainless Steel Three-Hand Watch",
}

function shoppingResult(title, extractedPrice = 119.99) {
  return {
    extracted_price: extractedPrice,
    product_link: `https://www.google.com/shopping/product/${encodeURIComponent(title)}`,
    title,
  }
}

function currentGoogleShoppingResult(title, extractedPrice = 119.99) {
  return {
    extracted_price: extractedPrice,
    product_link: `https://www.google.com/search?ibp=oshop&prds=pid%3A123&q=${encodeURIComponent(title)}`,
    title,
  }
}

describe('findSimilarShoppingAlternatives', () => {
  it('returns a broader same-product alternative with a plain-language difference', () => {
    const alternatives = findSimilarShoppingAlternatives({
      candidate,
      shoppingResults: [shoppingResult("Anne Klein Women's Gold-Tone Watch")],
    })

    expect(alternatives).toEqual([
      expect.objectContaining({
        currency: 'USD',
        difference: 'Different model or brand; compare the details before buying',
        title: "Anne Klein Women's Gold-Tone Watch",
      }),
    ])
  })

  it('calls out a concrete size difference when titles provide one', () => {
    const alternatives = findSimilarShoppingAlternatives({
      candidate: { ...candidate, title: 'Fossil 40mm Watch' },
      shoppingResults: [shoppingResult('Timex 36mm Watch')],
    })

    expect(alternatives[0]).toMatchObject({ difference: '36 mm instead of 40 mm' })
  })

  it('accepts the current Google Shopping search-product URL shape', () => {
    const alternatives = findSimilarShoppingAlternatives({
      candidate,
      shoppingResults: [currentGoogleShoppingResult("Anne Klein Women's Gold-Tone Watch")],
    })

    expect(alternatives).toHaveLength(1)
    expect(alternatives[0].url).toContain('ibp=oshop')
  })

  it('rejects accessories, repair tools, and books even when they share the product term', () => {
    const alternatives = findSimilarShoppingAlternatives({
      candidate,
      shoppingResults: [
        shoppingResult('Compatible Watch Band'),
        shoppingResult('Watch Screwdriver Repair Tool'),
        shoppingResult('Vintage Watch Catalog Book'),
      ],
    })

    expect(alternatives).toEqual([])
  })
})
