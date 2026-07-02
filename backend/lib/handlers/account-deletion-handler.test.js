import { describe, expect, it, vi } from 'vitest'

import { createAccountDeletionHandler } from './account-deletion-handler.js'

function responseRecorder() {
  return {
    body: '',
    statusCode: 0,
    writeHead(statusCode) { this.statusCode = statusCode },
    end(body = '') { this.body += body },
  }
}

function createHandler({ deleteUser, verifyToken }) {
  return createAccountDeletionHandler({
    getAdminClient: () => ({ auth: { admin: { deleteUser } } }),
    verifyToken,
  })
}

it.each([
  ['missing', 'missing_token'],
  ['invalid', 'invalid_token'],
])('rejects a %s authorization token', async (_label, reason) => {
  const deleteUser = vi.fn()
  const response = responseRecorder()
  const handler = createHandler({ deleteUser, verifyToken: vi.fn().mockResolvedValue({ ok: false, reason }) })

  await handler({ headers: {} }, response)

  expect(response.statusCode).toBe(401)
  expect(deleteUser).not.toHaveBeenCalled()
})

describe('authenticated account deletion', () => {
  it('deletes only the authenticated user and relies on verified ON DELETE CASCADE ownership cleanup', async () => {
    const ownedRows = new Map([
      ['user-1', { savedSearches: 2, priceWatches: 1, deepDiveUsage: 1 }],
      ['user-2', { savedSearches: 1, priceWatches: 0, deepDiveUsage: 1 }],
    ])
    const deleteUser = vi.fn(async (userId) => {
      ownedRows.delete(userId)
      return { error: null }
    })
    const response = responseRecorder()
    const handler = createHandler({
      deleteUser,
      verifyToken: vi.fn().mockResolvedValue({ ok: true, user: { id: 'user-1' } }),
    })

    await handler({ headers: { authorization: 'Bearer secret-token' } }, response)

    expect(deleteUser).toHaveBeenCalledWith('user-1')
    expect(ownedRows.has('user-1')).toBe(false)
    expect(ownedRows.has('user-2')).toBe(true)
    expect(response.statusCode).toBe(200)
    expect(JSON.parse(response.body)).toEqual({ ok: true, status: 'deleted' })
  })

  it('keeps a retryable server error when admin deletion fails', async () => {
    const response = responseRecorder()
    const handler = createHandler({
      deleteUser: vi.fn().mockResolvedValue({ error: { message: 'database unavailable' } }),
      verifyToken: vi.fn().mockResolvedValue({ ok: true, user: { id: 'user-1' } }),
    })

    await handler({ headers: {} }, response)

    expect(response.statusCode).toBe(500)
    expect(JSON.parse(response.body).error).toMatch(/try again/i)
  })

  it('treats a concurrent already-deleted result as success', async () => {
    const response = responseRecorder()
    const handler = createHandler({
      deleteUser: vi.fn().mockResolvedValue({ error: { status: 404, code: 'user_not_found' } }),
      verifyToken: vi.fn().mockResolvedValue({ ok: true, user: { id: 'user-1' } }),
    })

    await handler({ headers: {} }, response)

    expect(response.statusCode).toBe(200)
  })
})
