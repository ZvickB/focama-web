import * as actualFs from 'node:fs'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { resolve } from 'node:path'

const PRODUCT_DETAILS_CACHE_PATH = resolve(process.cwd(), 'temp-data', 'product-details-cache.json')
const SUPABASE_ENV_KEYS = ['SUPABASE_URL', 'SUPABASE_SECRET_KEY', 'SUPABASE_SERVICE_ROLE_KEY']

function createFsMock(overrides = {}) {
  return {
    ...actualFs,
    ...overrides,
  }
}

async function loadSearchStorageModule({
  supabaseClient = {
    from: vi.fn(),
  },
  fsOverrides = {},
} = {}) {
  vi.resetModules()
  vi.doMock('@supabase/supabase-js', () => ({
    createClient: vi.fn(() => supabaseClient),
  }))
  vi.doMock('node:fs', () => createFsMock(fsOverrides))

  return import('./search-storage.js')
}

describe('search-storage product details cache helpers', () => {
  const originalEnv = {}

  beforeEach(() => {
    vi.restoreAllMocks()
    vi.spyOn(console, 'warn').mockImplementation(() => {})

    for (const key of SUPABASE_ENV_KEYS) {
      originalEnv[key] = process.env[key]
      delete process.env[key]
    }

    if (actualFs.existsSync(PRODUCT_DETAILS_CACHE_PATH)) {
      actualFs.rmSync(PRODUCT_DETAILS_CACHE_PATH)
    }
  })

  afterEach(() => {
    for (const key of SUPABASE_ENV_KEYS) {
      if (typeof originalEnv[key] === 'undefined') {
        delete process.env[key]
      } else {
        process.env[key] = originalEnv[key]
      }
    }

    if (actualFs.existsSync(PRODUCT_DETAILS_CACHE_PATH)) {
      actualFs.rmSync(PRODUCT_DETAILS_CACHE_PATH)
    }

    vi.resetModules()
    vi.doUnmock('@supabase/supabase-js')
    vi.doUnmock('node:fs')
  })

  it('normalizes Supabase rows into a Map and omits missing asins', async () => {
    process.env.SUPABASE_URL = 'https://example.supabase.co'
    process.env.SUPABASE_SECRET_KEY = 'test-secret'

    const inMock = vi.fn().mockResolvedValue({
      data: [
        {
          asin: 'B001',
          feature_bullets: ['Lightweight', 'Carry-on friendly'],
          product_description: 'A compact stroller.',
          source: 'rainforest',
          needs_updating: false,
          next_update_at: null,
        },
        {
          asin: 'B002',
          feature_bullets: [],
          product_description: 'Still useful without bullet coverage.',
          source: 'rainforest',
          needs_updating: true,
          next_update_at: '2026-04-28T00:00:00.000Z',
        },
      ],
      error: null,
    })
    const selectMock = vi.fn(() => ({ in: inMock }))
    const supabaseClient = {
      from: vi.fn(() => ({ select: selectMock })),
    }

    const { readProductDetailsCacheEntries } = await loadSearchStorageModule({ supabaseClient })
    const result = await readProductDetailsCacheEntries(['B001', 'B002', 'B003'])

    expect(supabaseClient.from).toHaveBeenCalledWith('product_details_cache')
    expect(selectMock).toHaveBeenCalledWith(
      'asin, feature_bullets, product_description, source, needs_updating, next_update_at',
    )
    expect(inMock).toHaveBeenCalledWith('asin', ['B001', 'B002', 'B003'])
    expect(result).toBeInstanceOf(Map)
    expect(Array.from(result.keys())).toEqual(['B001', 'B002'])
    expect(result.get('B001')).toEqual({
      feature_bullets: ['Lightweight', 'Carry-on friendly'],
      productDescription: 'A compact stroller.',
      source: 'rainforest',
      needsUpdating: false,
      nextUpdateAt: null,
    })
    expect(result.get('B002')).toEqual({
      feature_bullets: [],
      productDescription: 'Still useful without bullet coverage.',
      source: 'rainforest',
      needsUpdating: true,
      nextUpdateAt: '2026-04-28T00:00:00.000Z',
    })
  })

  it('writes and reads the local JSON fallback shape when Supabase is not configured', async () => {
    const { readProductDetailsCacheEntries, writeProductDetailsCacheEntries } = await loadSearchStorageModule()

    await writeProductDetailsCacheEntries([
      {
        asin: 'B010',
        feature_bullets: ['Quiet motor', 'Compact body'],
        productDescription: 'Designed for small kitchens.',
        source: 'rainforest',
        needsUpdating: false,
        nextUpdateAt: null,
      },
      {
        asin: 'B011',
        feature_bullets: [],
        productDescription: 'Description-only partial row.',
        source: 'rainforest',
        needsUpdating: true,
        nextUpdateAt: '2026-04-28T00:00:00.000Z',
      },
    ])

    const writtenFile = JSON.parse(actualFs.readFileSync(PRODUCT_DETAILS_CACHE_PATH, 'utf8'))
    expect(writtenFile.entries.B010).toEqual(
      expect.objectContaining({
        feature_bullets: ['Quiet motor', 'Compact body'],
        productDescription: 'Designed for small kitchens.',
        source: 'rainforest',
        needsUpdating: false,
        nextUpdateAt: null,
      }),
    )
    expect(typeof writtenFile.entries.B010.cachedAt).toBe('string')

    const result = await readProductDetailsCacheEntries(['B010', 'B011', 'MISSING'])
    expect(Array.from(result.keys())).toEqual(['B010', 'B011'])
    expect(result.get('B010')).toEqual({
      feature_bullets: ['Quiet motor', 'Compact body'],
      productDescription: 'Designed for small kitchens.',
      source: 'rainforest',
      needsUpdating: false,
      nextUpdateAt: null,
    })
    expect(result.get('B011')).toEqual({
      feature_bullets: [],
      productDescription: 'Description-only partial row.',
      source: 'rainforest',
      needsUpdating: true,
      nextUpdateAt: '2026-04-28T00:00:00.000Z',
    })
  })

  it('preserves partial metadata from the local fallback cache', async () => {
    actualFs.mkdirSync(resolve(process.cwd(), 'temp-data'), { recursive: true })
    actualFs.writeFileSync(
      PRODUCT_DETAILS_CACHE_PATH,
      JSON.stringify({
        entries: {
          B020: {
            feature_bullets: [],
            productDescription: 'Needs bullet refresh.',
            source: 'rainforest',
            needsUpdating: true,
            nextUpdateAt: '2026-04-28T12:00:00.000Z',
            cachedAt: '2026-04-21T12:00:00.000Z',
          },
        },
      }, null, 2),
    )

    const { readProductDetailsCacheEntries } = await loadSearchStorageModule()
    const result = await readProductDetailsCacheEntries(['B020'])

    expect(result.get('B020')).toEqual({
      feature_bullets: [],
      productDescription: 'Needs bullet refresh.',
      source: 'rainforest',
      needsUpdating: true,
      nextUpdateAt: '2026-04-28T12:00:00.000Z',
    })
  })

  it('keeps writes best-effort when both Supabase and local storage fail', async () => {
    process.env.SUPABASE_URL = 'https://example.supabase.co'
    process.env.SUPABASE_SECRET_KEY = 'test-secret'

    const supabaseClient = {
      from: vi.fn(() => ({
        upsert: vi.fn().mockResolvedValue({
          error: new Error('supabase unavailable'),
        }),
      })),
    }

    const { writeProductDetailsCacheEntries } = await loadSearchStorageModule({
      supabaseClient,
      fsOverrides: {
        mkdirSync: vi.fn(),
        writeFileSync: vi.fn(() => {
          throw new Error('disk full')
        }),
      },
    })

    await expect(
      writeProductDetailsCacheEntries([
        {
          asin: 'B030',
          feature_bullets: ['Filtered water'],
          productDescription: 'Countertop unit.',
          source: 'rainforest',
          needsUpdating: false,
          nextUpdateAt: null,
        },
      ]),
    ).resolves.toBeUndefined()

    expect(console.warn).toHaveBeenCalled()
  })
})
