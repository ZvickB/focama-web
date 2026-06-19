import { describe, expect, it, vi } from 'vitest'
import { resolveOptionalAuthenticatedUser } from './auth.js'

describe('resolveOptionalAuthenticatedUser', () => {
  it('treats missing or invalid bearer tokens as signed out', async () => {
    const getUser = vi.fn()
    await expect(resolveOptionalAuthenticatedUser({ headers: {} }, { supabase: { auth: { getUser } } }))
      .resolves.toBeNull()
    expect(getUser).not.toHaveBeenCalled()

    getUser.mockResolvedValue({ data: { user: null }, error: new Error('invalid') })
    await expect(resolveOptionalAuthenticatedUser(
      { headers: { authorization: 'Bearer invalid-token' } },
      { supabase: { auth: { getUser } } },
    )).resolves.toBeNull()
  })

  it('returns a server-validated Supabase user', async () => {
    const user = { id: 'user-1', email: 'user@example.com' }
    const getUser = vi.fn().mockResolvedValue({ data: { user }, error: null })
    await expect(resolveOptionalAuthenticatedUser(
      { headers: { Authorization: 'Bearer valid-token' } },
      { supabase: { auth: { getUser } } },
    )).resolves.toEqual(user)
    expect(getUser).toHaveBeenCalledWith('valid-token')
  })
})
