import { describe, expect, it } from 'vitest'

import { buildProviderIdentity, normalizeProductIdentity } from './product-identity.js'

describe('product identity normalization', () => {
  it('preserves the source title and returns null defaults', () => {
    const result = normalizeProductIdentity({
      sourceTitle: 'Simple Ceramic Mug',
      aiNormalization: {
        display_title: 'Simple Ceramic Mug',
        match_identifier: {
          brand: null,
          model_number: null,
          product_type: 'mug',
          attributes: {},
        },
      },
    })

    expect(result.source_title).toBe('Simple Ceramic Mug')
    expect(result.display_title).toBe('Simple Ceramic Mug')
    expect(result.match_identifier).toEqual(expect.objectContaining({
      brand: null,
      model_number: null,
      upc: null,
      ean: null,
      gtin: null,
      product_type: 'mug',
    }))
  })

  it('keeps provider codes authoritative and ignores AI code-shaped properties', () => {
    const result = normalizeProductIdentity({
      sourceTitle: 'LEGO Classic 10698 Large Creative Brick Box',
      providerIdentity: {
        brand: 'LEGO',
        model_number: '10698',
        upc: '673419233606',
      },
      aiNormalization: {
        display_title: 'LEGO Classic 10698 Large Creative Brick Box',
        match_identifier: {
          brand: 'LEGO',
          model_number: '10698',
          upc: '000000000000',
          product_type: 'building set',
          attributes: {},
        },
      },
    })

    expect(result.match_identifier.upc).toBe('673419233606')
    expect(result.match_identifier.provenance.upc).toBe('provider')
  })

  it('rejects contaminated provider variants and retains title-backed identity details', () => {
    const result = normalizeProductIdentity({
      sourceTitle: 'Apple AirPods 4 with Active Noise Cancellation',
      providerIdentity: {
        brand: 'Apple',
        model_number: 'AirPods Max',
        attributes: { generation: '4' },
      },
      aiNormalization: {
        display_title: 'Apple AirPods 4 with ANC',
        match_identifier: {
          brand: 'Apple',
          model_number: null,
          product_type: 'wireless earbuds',
          attributes: { generation: '4' },
        },
      },
    })

    expect(result.match_identifier.model_number).not.toBe('AirPods Max')
    expect(result.match_identifier.attributes.generation).toBe('4')
  })

  it('falls back when cleanup removes model, capacity, size, or pack count', () => {
    const sourceTitle = 'Ninja CREAMi NC301C 16 oz Ice Cream Maker 2 Pack'
    const result = normalizeProductIdentity({
      sourceTitle,
      providerIdentity: {
        brand: 'Ninja',
        model_number: 'NC301C',
        attributes: { capacity: '16 oz', pack_count: 2 },
      },
      aiNormalization: {
        display_title: 'Ninja CREAMi Ice Cream Maker',
        match_identifier: {
          brand: 'Ninja',
          model_number: 'NC301C',
          product_type: 'ice cream maker',
          attributes: { capacity: '16 oz', pack_count: 2 },
        },
      },
    })

    expect(result.display_title).toBe(sourceTitle)
  })

  it('extracts provider identity from direct fields and specifications', () => {
    expect(buildProviderIdentity({
      product: { brand: 'Cuisinart', upc: '068459178126' },
      specifications: [
        { name: 'Item model number', value: 'ICE-21C' },
        { name: 'Capacity', value: '1.5 qt' },
      ],
    })).toEqual(expect.objectContaining({
      brand: 'Cuisinart',
      model_number: 'ICE-21C',
      upc: '068459178126',
      attributes: expect.objectContaining({ capacity: '1.5 qt' }),
    }))
  })
})
