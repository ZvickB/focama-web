import { fetchBackend } from '@/lib/backendUrl.js'

export async function deleteAccount(accessToken) {
  if (!accessToken) throw new Error('Your session has expired. Please sign in again.')

  const response = await fetchBackend('/api/account', {
    method: 'DELETE',
    headers: { Authorization: `Bearer ${accessToken}` },
  })
  const payload = await response.json().catch(() => ({}))

  if (!response.ok) {
    throw new Error(payload.error || 'We could not delete your account. Please try again.')
  }

  return payload
}
