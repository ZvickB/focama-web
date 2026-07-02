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
    'Women’s Underwear',
    'Breathable Underwear',
    'Underwear for Women',
    'Women Breathable Cotton Underwear',
    'Cotton Briefs for Women',
    'Ladies Seamless Underwear',
    'One Piece Swimsuit',
    'Bikini Trimmer',
    'Women’s Shapewear Bodysuit',
    'Summer Crop Top',
  ])('hides sensitive product image for %s', (title) => {
    expect(moderateProduct({ title }).outcome).toBe(MODERATION_OUTCOMES.HIDE_IMAGE)
  })

  it.each([
    'Men’s Boxer Briefs',
    'Breathable Underwear for Men',
    'Boxer Briefs',
    'Girls Cotton Briefs',
    "Girls' Panties",
    'Kids Underwear',
    'Children Underwear',
    'Toddler Training Underwear',
    'Running Shorts',
    'Tank Top',
    'Women’s Leggings',
  ])('allows agreed ordinary apparel %s', (title) => {
    expect(moderateProduct({ title }).outcome).toBe(MODERATION_OUTCOMES.ALLOW)
  })

  it.each([
    'Nursing Pads',
    'Organic Cotton Tampons',
    'Menstrual Cup',
    'Feminine Hygiene Pads',
  ])('keeps nursing and feminine-hygiene product images visible for %s', (title) => {
    expect(moderateProduct({ title }).outcome).toBe(MODERATION_OUTCOMES.ALLOW)
  })

  it('uses product category context when the title alone is ambiguous', () => {
    expect(moderateProduct({ title: 'Cotton Basics 5 Pack', category: "Girls' Underwear" }).outcome).toBe(MODERATION_OUTCOMES.ALLOW)
    expect(moderateProduct({ title: 'Breathable Cotton Basics', category: "Women's Underwear" }).outcome).toBe(MODERATION_OUTCOMES.HIDE_IMAGE)
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
