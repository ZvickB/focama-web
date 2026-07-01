import { describe, expect, it } from 'vitest'
import {
  applyProductModeration,
  MODERATION_OUTCOMES,
  moderateProduct,
  moderateProductList,
  moderateQuery,
} from './content-moderation.js'

describe('content moderation', () => {
  it.each(['sex toy', 'personal lubricant', 'K-Y jelly', 'vibrater'])('blocks explicit query %s', (query) => {
    expect(moderateQuery(query).outcome).toBe(MODERATION_OUTCOMES.BLOCK)
  })

  it.each(['bike lubricant', 'Kentucky travel guide', 'boxer briefs', 'shorts'])('allows ordinary query %s', (query) => {
    expect(moderateQuery(query).outcome).toBe(MODERATION_OUTCOMES.ALLOW)
  })

  it.each([
    'Women’s Cotton Bra',
    'One Piece Swimsuit',
    'Bikini Trimmer',
    'Women’s Shapewear Bodysuit',
    'Summer Crop Top',
  ])('hides sensitive product image for %s', (title) => {
    expect(moderateProduct({ title }).outcome).toBe(MODERATION_OUTCOMES.HIDE_IMAGE)
  })

  it.each(['Men’s Boxer Briefs', 'Running Shorts', 'Tank Top', 'Women’s Leggings'])('allows agreed ordinary apparel %s', (title) => {
    expect(moderateProduct({ title }).outcome).toBe(MODERATION_OUTCOMES.ALLOW)
  })

  it('allows safe accessories despite sensitive nouns', () => {
    expect(moderateProduct({ title: 'Bra Wash Bag for Laundry' }).outcome).toBe(MODERATION_OUTCOMES.ALLOW)
  })

  it('hides sensitive-topic book covers but blocks erotica', () => {
    expect(moderateProduct({ title: 'A Marriage Workbook Book' }).outcome).toBe(MODERATION_OUTCOMES.HIDE_IMAGE)
    expect(moderateProduct({ title: 'Erotic Romance Novel' }).outcome).toBe(MODERATION_OUTCOMES.BLOCK)
  })

  it('clears images and keeps text for hide-image products', () => {
    const product = applyProductModeration({ product_id: 'one', title: 'Women’s Swimsuit', thumbnail: 'image.jpg' })
    expect(product).toMatchObject({ title: 'Women’s Swimsuit', thumbnail: '', moderation: { outcome: 'hide_image' } })
  })

  it('removes blocked products from lists', () => {
    const products = moderateProductList([
      { title: 'Office Chair' },
      { title: 'Adult Sex Toy' },
    ])
    expect(products.map((product) => product.title)).toEqual(['Office Chair'])
  })
})
