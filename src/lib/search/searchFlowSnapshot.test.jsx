import { beforeEach, describe, expect, it } from 'vitest'

import { clearFlowSnapshot, readFlowSnapshot, saveFlowSnapshot } from './searchFlowSnapshot.js'

const STORAGE_KEY = 'focamai:searchFlowSnapshot:v1'

describe('searchFlowSnapshot', () => {
  beforeEach(() => {
    window.localStorage.clear()
  })

  it('saves and reads back a refine-phase snapshot', () => {
    saveFlowSnapshot({
      discoveryToken: 'token-1',
      phase: 'refine',
      submittedQuery: 'office chair',
    })

    const snapshot = readFlowSnapshot()

    expect(snapshot).toMatchObject({
      discoveryToken: 'token-1',
      phase: 'refine',
      submittedQuery: 'office chair',
    })
  })

  it('lets a results snapshot overwrite an earlier refine snapshot', () => {
    saveFlowSnapshot({ discoveryToken: 'token-1', phase: 'refine', submittedQuery: 'office chair' })
    saveFlowSnapshot({
      discoveryToken: 'token-1',
      phase: 'results',
      results: [{ id: 'a' }],
      submittedQuery: 'office chair',
    })

    const snapshot = readFlowSnapshot()

    expect(snapshot.phase).toBe('results')
    expect(snapshot.results).toEqual([{ id: 'a' }])
  })

  it('ignores an invalid phase', () => {
    saveFlowSnapshot({ discoveryToken: 'token-1', phase: 'discovering', submittedQuery: 'office chair' })

    expect(readFlowSnapshot()).toBeNull()
  })

  it('rejects a snapshot missing the discovery token or query', () => {
    window.localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({ phase: 'refine', savedAt: Date.now() }),
    )

    expect(readFlowSnapshot()).toBeNull()
  })

  it('rejects an expired snapshot', () => {
    window.localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({
        discoveryToken: 'token-1',
        phase: 'refine',
        savedAt: Date.now() - 2 * 60 * 60 * 1000,
        submittedQuery: 'office chair',
      }),
    )

    expect(readFlowSnapshot()).toBeNull()
    expect(window.localStorage.getItem(STORAGE_KEY)).toBeNull()
  })

  it('clears the stored snapshot', () => {
    saveFlowSnapshot({ discoveryToken: 'token-1', phase: 'refine', submittedQuery: 'office chair' })
    clearFlowSnapshot()

    expect(readFlowSnapshot()).toBeNull()
  })
})
