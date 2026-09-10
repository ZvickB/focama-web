import { beforeEach, describe, expect, it, vi } from 'vitest'

import { localHistoryStore } from '@/lib/history/localHistoryStore.js'
import { migrateLocalHistoryToAccount } from '@/lib/history/migrateLocalHistory.js'
import { createRemoteHistoryStore } from '@/lib/history/remoteHistoryStore.js'
import {
  loadRemoteRankingPreference,
  saveRemoteRankingPreference,
} from '@/lib/preferences/rankingPreferenceStore.js'

beforeEach(() => {
  window.localStorage.clear()
})

describe('account persistence', () => {
  it('saves and reloads local history while replacing the same search instead of duplicating it', async () => {
    await localHistoryStore.save({ query: 'Stroller', followUp: 'lightweight', results: [{ id: 'old' }] })
    const replacement = await localHistoryStore.save({
      query: 'stroller',
      followUp: 'lightweight',
      results: [{ id: 'new' }],
    })

    const reloaded = await localHistoryStore.list()
    expect(reloaded).toHaveLength(1)
    expect(reloaded[0]).toMatchObject({ id: replacement.id, query: 'stroller', results: [{ id: 'new' }] })
  })

  it('scopes remote history reads and deletion to the authenticated account', async () => {
    const order = vi.fn().mockResolvedValue({ data: [{
      id: 'entry-1',
      user_id: 'user-a',
      query: 'desk lamp',
      query_key: 'desk lamp|',
      results: [],
      created_at: '2026-09-01T00:00:00.000Z',
      updated_at: '2026-09-02T00:00:00.000Z',
    }], error: null })
    const readEq = vi.fn(() => ({ order }))
    const deleteEq = vi.fn()
    deleteEq
      .mockReturnValueOnce({ eq: deleteEq })
      .mockResolvedValueOnce({ error: null })
    const client = {
      from: vi.fn()
        .mockReturnValueOnce({ select: () => ({ eq: readEq }) })
        .mockReturnValueOnce({ delete: () => ({ eq: deleteEq }) }),
    }
    const store = createRemoteHistoryStore({ client, userId: 'user-a' })

    expect((await store.list())[0]).toMatchObject({ id: 'entry-1', query: 'desk lamp' })
    await store.remove('entry-1')

    expect(readEq).toHaveBeenCalledWith('user_id', 'user-a')
    expect(deleteEq.mock.calls).toEqual([
      ['user_id', 'user-a'],
      ['id', 'entry-1'],
    ])
  })

  it('upserts remote history with account ownership and per-user query uniqueness', async () => {
    const single = vi.fn().mockResolvedValue({ data: {
      id: 'entry-1',
      query: 'desk lamp',
      query_key: 'desk lamp|',
      results: [],
      created_at: '2026-09-01T00:00:00.000Z',
      updated_at: '2026-09-02T00:00:00.000Z',
    }, error: null })
    const select = vi.fn(() => ({ single }))
    const upsert = vi.fn(() => ({ select }))
    const client = { from: vi.fn(() => ({ upsert })) }

    await createRemoteHistoryStore({ client, userId: 'user-a' }).save({ query: 'desk lamp', results: [] })

    expect(upsert).toHaveBeenCalledWith(
      expect.objectContaining({ user_id: 'user-a', query: 'desk lamp' }),
      { onConflict: 'user_id,query_key' },
    )
  })

  it('loads and saves ranking preferences only for the authenticated account', async () => {
    const maybeSingle = vi.fn().mockResolvedValue({ data: { ranking_priority: 'price' }, error: null })
    const readEq = vi.fn(() => ({ maybeSingle }))
    const single = vi.fn().mockResolvedValue({ data: { ranking_priority: 'range' }, error: null })
    const writeSelect = vi.fn(() => ({ single }))
    const upsert = vi.fn(() => ({ select: writeSelect }))
    const client = {
      from: vi.fn()
        .mockReturnValueOnce({ select: () => ({ eq: readEq }) })
        .mockReturnValueOnce({ upsert }),
    }

    expect(await loadRemoteRankingPreference({ client, userId: 'user-a' })).toBe('price')
    expect(await saveRemoteRankingPreference({ client, userId: 'user-a', rankingPreference: 'range' })).toBe('range')
    expect(readEq).toHaveBeenCalledWith('user_id', 'user-a')
    expect(upsert).toHaveBeenCalledWith(
      expect.objectContaining({ user_id: 'user-a', ranking_priority: 'range' }),
      { onConflict: 'user_id' },
    )
  })

  it('migrates every local history entry before clearing device history', async () => {
    const entries = [{ id: 'one' }, { id: 'two' }]
    const sourceStore = { list: vi.fn().mockResolvedValue(entries), clear: vi.fn() }
    const remoteStore = { save: vi.fn().mockResolvedValue(undefined) }

    await migrateLocalHistoryToAccount(remoteStore, sourceStore)

    expect(remoteStore.save.mock.calls).toEqual([[entries[0]], [entries[1]]])
    expect(sourceStore.clear).toHaveBeenCalledTimes(1)
  })

  it('keeps local history intact when account migration fails', async () => {
    const sourceStore = { list: vi.fn().mockResolvedValue([{ id: 'one' }]), clear: vi.fn() }
    const remoteStore = { save: vi.fn().mockRejectedValue(new Error('offline')) }

    await expect(migrateLocalHistoryToAccount(remoteStore, sourceStore)).rejects.toThrow('offline')
    expect(sourceStore.clear).not.toHaveBeenCalled()
  })
})
