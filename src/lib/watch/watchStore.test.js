import { describe, expect, it } from 'vitest'

import { createWatchStore, MAX_PRICE_WATCHES } from '@/lib/watch/watchStore.js'

function createFakeClient(initialRows = []) {
  const rows = [...initialRows]

  class Query {
    constructor(table) {
      this.filters = []
      this.insertRow = null
      this.mode = 'select'
      this.options = {}
      this.patch = null
      this.table = table
    }

    select(_columns, options = {}) {
      this.options = options || {}
      return this
    }

    eq(column, value) {
      this.filters.push([column, value])
      return this
    }

    order() {
      return this
    }

    insert(row) {
      this.mode = 'insert'
      this.insertRow = row
      return this
    }

    update(patch) {
      this.mode = 'update'
      this.patch = patch
      return this
    }

    delete() {
      this.mode = 'delete'
      return this
    }

    matches(row) {
      return this.filters.every(([column, value]) => row[column] === value)
    }

    resultRows() {
      return rows.filter((row) => this.matches(row))
    }

    async maybeSingle() {
      return { data: this.resultRows()[0] || null, error: null }
    }

    async single() {
      if (this.mode === 'insert') {
        const inserted = {
          created_at: '2026-06-25T00:00:00.000Z',
          id: `watch-${rows.length + 1}`,
          last_checked_at: null,
          last_notified_at: null,
          last_notified_price: null,
          last_seen_price: null,
          paused: false,
          ...this.insertRow,
        }
        rows.unshift(inserted)
        return { data: inserted, error: null }
      }

      if (this.mode === 'update') {
        const row = rows.find((entry) => this.matches(entry))
        Object.assign(row, this.patch)
        return { data: row, error: null }
      }

      return { data: this.resultRows()[0] || null, error: null }
    }

    then(resolve, reject) {
      try {
        if (this.mode === 'delete') {
          for (let index = rows.length - 1; index >= 0; index -= 1) {
            if (this.matches(rows[index])) rows.splice(index, 1)
          }
          return Promise.resolve({ data: null, error: null }).then(resolve, reject)
        }

        if (this.options?.head) {
          return Promise.resolve({ count: this.resultRows().length, data: null, error: null }).then(resolve, reject)
        }

        return Promise.resolve({ data: this.resultRows(), error: null }).then(resolve, reject)
      } catch (error) {
        return Promise.reject(error).then(resolve, reject)
      }
    }
  }

  return {
    get rows() {
      return rows
    },
    from(table) {
      return new Query(table)
    },
  }
}

function createRow(overrides = {}) {
  return {
    amazon_domain: 'amazon.com',
    asin: `B00${Math.random()}`,
    baseline_price: 100,
    created_at: '2026-06-25T00:00:00.000Z',
    id: crypto.randomUUID(),
    image_url: '',
    last_checked_at: null,
    last_notified_at: null,
    last_notified_price: null,
    last_seen_price: null,
    paused: false,
    product_title: 'Watched product',
    product_url: '',
    target_price: null,
    threshold_pct: 5,
    updated_at: '2026-06-25T00:00:00.000Z',
    user_id: 'user-1',
    ...overrides,
  }
}

describe('watchStore', () => {
  it('returns an existing watch for duplicate ASIN and marketplace before checking the max limit', async () => {
    const existing = createRow({ asin: 'B001' })
    const client = createFakeClient([
      existing,
      ...Array.from({ length: MAX_PRICE_WATCHES - 1 }, (_, index) => createRow({ asin: `B00X${index}` })),
    ])
    const store = createWatchStore({ client, userId: 'user-1' })

    const watch = await store.create({
      amazonDomain: 'amazon.com',
      asin: 'B001',
      baselinePrice: 88,
      productTitle: 'Duplicate product',
      thresholdPct: 5,
    })

    expect(watch.id).toBe(existing.id)
    expect(client.rows).toHaveLength(MAX_PRICE_WATCHES)
  })

  it('blocks a sixth watch for the same user', async () => {
    const client = createFakeClient(
      Array.from({ length: MAX_PRICE_WATCHES }, (_, index) => createRow({ asin: `B00${index}` })),
    )
    const store = createWatchStore({ client, userId: 'user-1' })

    await expect(store.create({
      amazonDomain: 'amazon.com',
      asin: 'B999',
      baselinePrice: 88,
      productTitle: 'New product',
      thresholdPct: 5,
    })).rejects.toThrow(/up to 5 products/i)
  })
})
