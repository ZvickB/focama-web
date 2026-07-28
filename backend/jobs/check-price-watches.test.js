import { describe, expect, it, vi } from 'vitest'

import {
  computePriceWatchEligibility,
  groupActiveWatchesByDomain,
  runPriceWatchCheck,
  runPriceWatchDryRun,
} from './check-price-watches.js'

function createRow(overrides = {}) {
  return {
    amazon_domain: 'amazon.com',
    asin: 'B001',
    baseline_price: 100,
    created_at: '2026-06-25T00:00:00.000Z',
    id: 'watch-1',
    image_url: 'https://images.example.com/product.jpg',
    last_checked_at: null,
    last_notified_at: null,
    last_notified_price: null,
    last_seen_price: null,
    paused: false,
    product_title: 'Watched product',
    target_price: null,
    threshold_pct: 5,
    updated_at: '2026-06-25T00:00:00.000Z',
    user_id: 'user-1',
    ...overrides,
  }
}

function createFakeSupabase(initialRows = []) {
  const rows = initialRows.map((row) => ({ ...row }))
  const updates = []
  const usersById = new Map(rows.map((row) => [row.user_id, { email: `${row.user_id}@example.com` }]))

  class Query {
    constructor(table) {
      this.filters = []
      this.mode = 'select'
      this.patch = null
      this.table = table
    }

    select() {
      return this
    }

    eq(column, value) {
      this.filters.push([column, value])
      return this
    }

    order() {
      return this
    }

    update(patch) {
      this.mode = 'update'
      this.patch = patch
      return this
    }

    matches(row) {
      return this.filters.every(([column, value]) => row[column] === value)
    }

    then(resolve, reject) {
      try {
        if (this.mode === 'update') {
          for (const row of rows) {
            if (this.matches(row)) {
              Object.assign(row, this.patch)
              updates.push({ id: row.id, patch: this.patch })
            }
          }

          return Promise.resolve({ data: null, error: null }).then(resolve, reject)
        }

        return Promise.resolve({
          data: rows.filter((row) => this.matches(row)),
          error: null,
        }).then(resolve, reject)
      } catch (error) {
        return Promise.reject(error).then(resolve, reject)
      }
    }
  }

  return {
    auth: {
      admin: {
        async getUserById(userId) {
          return {
            data: {
              user: usersById.get(userId) || null,
            },
            error: null,
          }
        },
      },
    },
    get rows() {
      return rows
    },
    get updates() {
      return updates
    },
    from(table) {
      return new Query(table)
    },
  }
}

describe('computePriceWatchEligibility', () => {
  it('marks a threshold drop eligible', () => {
    const result = computePriceWatchEligibility(
      { baselinePrice: 100, targetPrice: null, thresholdPct: 5 },
      { currentPrice: 94 },
    )

    expect(result).toEqual(expect.objectContaining({
      eligible: true,
      meetsPct: true,
      meetsTarget: false,
      reason: 'would_notify',
    }))
    expect(result.dropPct).toBe(6)
  })

  it('marks an absolute target hit eligible', () => {
    const result = computePriceWatchEligibility(
      { baselinePrice: 100, targetPrice: 90, thresholdPct: 20 },
      { currentPrice: 90 },
    )

    expect(result).toEqual(expect.objectContaining({
      eligible: true,
      meetsPct: false,
      meetsTarget: true,
    }))
  })

  it('skips missing prices instead of treating them as a drop', () => {
    const result = computePriceWatchEligibility(
      { baselinePrice: 100, targetPrice: null, thresholdPct: 5 },
      { currentPrice: null, unavailableReason: 'out_of_stock' },
    )

    expect(result).toEqual(expect.objectContaining({
      eligible: false,
      reason: 'out_of_stock',
    }))
  })
})

describe('price watch dry-run job', () => {
  it('groups only active watches by marketplace', () => {
    const grouped = groupActiveWatchesByDomain([
      createRow({ amazon_domain: 'amazon.com', asin: 'B001', id: 'watch-1' }),
      createRow({ amazon_domain: 'amazon.ca', asin: 'B002', id: 'watch-2' }),
      createRow({ amazon_domain: 'amazon.com', asin: 'B003', id: 'watch-3', paused: true }),
      createRow({ amazon_domain: 'amazon.com', asin: '', id: 'watch-4' }),
    ])

    expect([...grouped.keys()]).toEqual(['amazon.com', 'amazon.ca'])
    expect(grouped.get('amazon.com')).toHaveLength(1)
    expect(grouped.get('amazon.ca')).toHaveLength(1)
  })

  it('dedupes provider checks, updates every active watch, and logs would-notify rows', async () => {
    const supabase = createFakeSupabase([
      createRow({ asin: 'B001', id: 'watch-1', baseline_price: 100, threshold_pct: 5 }),
      createRow({ asin: 'B001', id: 'watch-2', baseline_price: 120, threshold_pct: 26 }),
      createRow({ asin: 'B002', id: 'watch-3', baseline_price: 100, target_price: 80, threshold_pct: 50 }),
      createRow({ asin: 'B003', id: 'watch-4', baseline_price: 100, paused: true }),
    ])
    const logger = {
      error: vi.fn(),
      info: vi.fn(),
    }
    const priceChecker = vi.fn(async ({ asins, amazonDomain, checkedAt }) => new Map(
      asins.map((asin) => [asin, {
        amazonDomain,
        asin,
        checkedAt,
        currentPrice: asin === 'B001' ? 90 : 80,
        source: 'rainforest',
      }]),
    ))

    const summary = await runPriceWatchDryRun({
      checkedAt: '2026-06-25T13:00:00.000Z',
      logger,
      priceChecker,
      rainforestApiKey: 'rf-key',
      supabase,
    })

    expect(priceChecker).toHaveBeenCalledTimes(1)
    expect(priceChecker.mock.calls[0][0]).toEqual(expect.objectContaining({
      amazonDomain: 'amazon.com',
      asins: ['B001', 'B002'],
    }))
    expect(summary.checkedWatches).toBe(3)
    expect(summary.skippedWatches).toBe(1)
    expect(summary.wouldNotify).toHaveLength(2)
    expect(summary.wouldNotify.map((item) => item.id)).toEqual(['watch-1', 'watch-3'])
    expect(supabase.updates).toHaveLength(3)
    expect(supabase.rows.find((row) => row.id === 'watch-1').last_seen_price).toBe(90)
    expect(supabase.rows.find((row) => row.id === 'watch-3').last_seen_price).toBe(80)
    expect(supabase.rows.find((row) => row.id === 'watch-4').last_checked_at).toBeNull()
  })

  it('updates last_checked_at but preserves last_seen_price when the provider has no alertable price', async () => {
    const supabase = createFakeSupabase([
      createRow({ asin: 'B404', id: 'watch-1', last_seen_price: 99 }),
    ])
    const logger = {
      error: vi.fn(),
      info: vi.fn(),
    }
    const priceChecker = vi.fn(async ({ asins, amazonDomain, checkedAt }) => new Map(
      asins.map((asin) => [asin, {
        amazonDomain,
        asin,
        checkedAt,
        currentPrice: null,
        source: 'rainforest',
        unavailableReason: 'missing_price',
      }]),
    ))

    const summary = await runPriceWatchDryRun({
      checkedAt: '2026-06-25T13:00:00.000Z',
      logger,
      priceChecker,
      supabase,
    })

    expect(summary).toEqual(expect.objectContaining({
      checkedWatches: 1,
      skippedWatches: 1,
    }))
    expect(summary.wouldNotify).toHaveLength(0)
    expect(supabase.rows[0].last_checked_at).toBe('2026-06-25T13:00:00.000Z')
    expect(supabase.rows[0].last_seen_price).toBe(99)
  })

  it('sends email and resets the baseline only after a successful live alert', async () => {
    const supabase = createFakeSupabase([
      createRow({ asin: 'B001', baseline_price: 100, id: 'watch-1', product_url: 'https://www.amazon.com/dp/B001' }),
    ])
    const logger = {
      error: vi.fn(),
      info: vi.fn(),
    }
    const sendPriceDropEmail = vi.fn(async () => ({ id: 'email-1' }))
    const priceChecker = vi.fn(async ({ asins, amazonDomain, checkedAt }) => new Map(
      asins.map((asin) => [asin, {
        amazonDomain,
        asin,
        checkedAt,
        currency: 'USD',
        currentPrice: 90,
        productUrl: 'https://www.amazon.com/dp/B001?tag=focamai-20',
        source: 'rainforest',
      }]),
    ))

    const summary = await runPriceWatchCheck({
      checkedAt: '2026-06-25T13:00:00.000Z',
      emailConfig: {
        from: 'Focamai <contact@focamai.com>',
        manageUrl: 'https://focamai.com/watches',
      },
      emailEnabled: true,
      emailSender: () => sendPriceDropEmail,
      logger,
      priceChecker,
      supabase,
    })

    expect(sendPriceDropEmail).toHaveBeenCalledWith(expect.objectContaining({
      from: 'Focamai <contact@focamai.com>',
      manageUrl: 'https://focamai.com/watches',
      newPrice: 90,
      oldPrice: 100,
      imageUrl: 'https://images.example.com/product.jpg',
      productUrl: 'https://www.amazon.com/dp/B001?tag=focamai-20',
      to: 'user-1@example.com',
    }))
    expect(summary.emailsSent).toBe(1)
    expect(summary.emailsFailed).toBe(0)
    expect(supabase.rows[0].baseline_price).toBe(90)
    expect(supabase.rows[0].last_notified_price).toBe(90)
    expect(supabase.rows[0].last_notified_at).toBe('2026-06-25T13:00:00.000Z')
  })

  it('does not reset baseline or notification fields when email sending fails', async () => {
    const supabase = createFakeSupabase([
      createRow({ asin: 'B001', baseline_price: 100, id: 'watch-1' }),
    ])
    const logger = {
      error: vi.fn(),
      info: vi.fn(),
    }
    const sendPriceDropEmail = vi.fn(async () => {
      throw new Error('Resend failed')
    })
    const priceChecker = vi.fn(async ({ asins, amazonDomain, checkedAt }) => new Map(
      asins.map((asin) => [asin, {
        amazonDomain,
        asin,
        checkedAt,
        currency: 'USD',
        currentPrice: 90,
        source: 'rainforest',
      }]),
    ))

    const summary = await runPriceWatchCheck({
      checkedAt: '2026-06-25T13:00:00.000Z',
      emailEnabled: true,
      emailSender: () => sendPriceDropEmail,
      logger,
      priceChecker,
      supabase,
    })

    expect(summary.emailsSent).toBe(0)
    expect(summary.emailsFailed).toBe(1)
    expect(supabase.rows[0].baseline_price).toBe(100)
    expect(supabase.rows[0].last_notified_price).toBeNull()
    expect(supabase.rows[0].last_checked_at).toBe('2026-06-25T13:00:00.000Z')
    expect(supabase.rows[0].last_seen_price).toBe(90)
  })
})
