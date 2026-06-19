import { afterEach, describe, expect, it, vi } from 'vitest'
import { mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const originalCwd = process.cwd()

afterEach(() => {
  process.chdir(originalCwd)
  vi.resetModules()
  vi.restoreAllMocks()
  vi.doUnmock('./supabase-client.js')
})

function cacheEntry() {
  return {
    cacheKey: 'cache-key',
    candidateId: 'B012345678',
    marketplace: 'CA',
    coverageMode: 'major_retailers',
    strategyVersion: 1,
    identity: { model_number: 'ABC-123' },
    status: 'complete',
    query: 'ABC-123',
    offers: [{ offer_key: 'serpapi:offer-1', price: 90 }],
    accepted: [],
    rejected: [{ reason: 'low_confidence' }],
    providerErrors: {},
    matchCachedAt: '2026-06-15T12:00:00.000Z',
    matchExpiresAt: '2026-06-22T12:00:00.000Z',
    priceCachedAt: '2026-06-15T12:00:00.000Z',
    priceExpiresAt: '2026-06-15T12:30:00.000Z',
  }
}

describe('price comparison storage', () => {
  it('uses the local JSON fallback when Supabase is not configured', async () => {
    const cwd = mkdtempSync(join(tmpdir(), 'focamai-comparison-'))
    process.chdir(cwd)
    vi.doMock('./supabase-client.js', () => ({
      getSupabaseAdminClient: vi.fn(),
      isSupabaseConfigured: vi.fn(() => false),
      logStorageWarning: vi.fn(),
      PRICE_COMPARISON_CACHE_TABLE: 'price_comparison_cache',
    }))
    const storage = await import('./price-comparison-storage.js')
    const entry = cacheEntry()

    await storage.writePriceComparisonCacheEntry(entry)
    await expect(storage.readPriceComparisonCacheEntry(entry.cacheKey)).resolves.toEqual(entry)
    expect(JSON.parse(readFileSync(join(cwd, 'temp-data', 'price-comparison-cache.json'), 'utf8')).entries)
      .toHaveProperty(entry.cacheKey)
    process.chdir(originalCwd)
    rmSync(cwd, { recursive: true, force: true })
  })

  it('maps cache fields to the Supabase table', async () => {
    const upsert = vi.fn().mockResolvedValue({ error: null })
    const maybeSingle = vi.fn().mockResolvedValue({ data: null, error: null })
    const from = vi.fn(() => ({
      upsert,
      select: vi.fn(() => ({ eq: vi.fn(() => ({ maybeSingle })) })),
    }))
    vi.doMock('./supabase-client.js', () => ({
      getSupabaseAdminClient: vi.fn(() => ({ from })),
      isSupabaseConfigured: vi.fn(() => true),
      logStorageWarning: vi.fn(),
      PRICE_COMPARISON_CACHE_TABLE: 'price_comparison_cache',
    }))
    const storage = await import('./price-comparison-storage.js')
    const entry = cacheEntry()

    await storage.writePriceComparisonCacheEntry(entry)
    expect(from).toHaveBeenCalledWith('price_comparison_cache')
    expect(upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        cache_key: entry.cacheKey,
        identity: entry.identity,
        offers: entry.offers,
        rejected: entry.rejected,
      }),
      { onConflict: 'cache_key' },
    )
  })
})
