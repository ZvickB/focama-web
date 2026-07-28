import { describe, expect, it } from 'vitest'

import { areSameProductFamily, selectDistinctCandidates } from './product-identity.js'

const candidate = (id, brandName, title) => ({ id, brandName, title })

describe('product identity smoke cases', () => {
  it.each([
    ['collapses Soundcore Q20i colorways', candidate('q20i-black', 'soundcore', 'soundcore by Anker Q20i Hybrid ANC Headphones Black'), candidate('q20i-pink', 'soundcore', 'soundcore by Anker Q20i Hybrid ANC Headphones Pink'), true],
    ['collapses Soundcore Q30 colorways despite marketing copy', candidate('q30-black', 'soundcore', 'soundcore by Anker Life Q30 Hybrid ANC Headphones Black'), candidate('q30-white', 'soundcore', 'soundcore by Anker Q30 Hybrid ANC Headphones White'), true],
    ['keeps Q20i and Q30 as distinct models', candidate('q20i', 'soundcore', 'soundcore by Anker Q20i Hybrid ANC Headphones'), candidate('q30', 'soundcore', 'soundcore by Anker Q30 Hybrid ANC Headphones'), false],
    ['collapses Nike Pegasus 41 colorways', candidate('pegasus-black', 'Nike', 'Nike Pegasus 41 Running Shoes Black'), candidate('pegasus-blue', 'Nike', 'Nike Pegasus 41 Running Shoes Blue'), true],
    ['keeps Nike Pegasus and Vomero as distinct models', candidate('pegasus', 'Nike', 'Nike Pegasus 41 Running Shoes'), candidate('vomero', 'Nike', 'Nike Vomero 5 Running Shoes'), false],
    ['keeps different storage capacities', candidate('iphone-128', 'Apple', 'Apple iPhone 15 128GB Black'), candidate('iphone-256', 'Apple', 'Apple iPhone 15 256GB Black'), false],
    ['keeps regular and wide shoe fits distinct', candidate('pegasus-regular', 'Nike', 'Nike Pegasus 41 Running Shoes Regular'), candidate('pegasus-wide', 'Nike', 'Nike Pegasus 41 Running Shoes Wide'), false],
    ['collapses Sony WH-1000XM5 colorways', candidate('sony-black', 'Sony', 'Sony WH-1000XM5 Headphones Black'), candidate('sony-silver', 'Sony', 'Sony WH-1000XM5 Headphones Silver'), true],
    ['keeps major feature tiers distinct', candidate('qc', 'Bose', 'Bose QuietComfort Headphones'), candidate('qc-ultra', 'Bose', 'Bose QuietComfort Ultra Headphones'), false],
  ])('%s', (_name, left, right, expected) => {
    expect(areSameProductFamily(left, right)).toBe(expected)
  })

  it('keeps unique Haiku picks first and appends pool replacements', () => {
    const q20iBlack = candidate('q20i-black', 'soundcore', 'soundcore by Anker Q20i Hybrid ANC Headphones Black')
    const q20iPink = candidate('q20i-pink', 'soundcore', 'soundcore by Anker Q20i Hybrid ANC Headphones Pink')
    const q30White = candidate('q30-white', 'soundcore', 'soundcore by Anker Q30 Hybrid ANC Headphones White')
    const jbl = candidate('jbl', 'JBL', 'JBL Tune 670NC Headphones')
    const shokz = candidate('shokz', 'SHOKZ', 'SHOKZ OpenRun Pro 2')

    expect(selectDistinctCandidates({
      preferredCandidates: [q20iBlack, q20iPink, q30White],
      fallbackCandidates: [q20iBlack, q20iPink, q30White, jbl, shokz],
      limit: 4,
    }).map((item) => item.id)).toEqual(['q20i-black', 'q30-white', 'jbl', 'shokz'])
  })
})
