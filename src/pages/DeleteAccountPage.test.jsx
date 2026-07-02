import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import DeleteAccountPage from '@/pages/DeleteAccountPage.jsx'

const auth = vi.hoisted(() => ({
  loading: false,
  session: null,
  signOut: vi.fn(),
  user: null,
}))
const deleteAccount = vi.hoisted(() => vi.fn())

vi.mock('@/contexts/useAuth.js', () => ({ useAuth: () => auth }))
vi.mock('@/lib/account/deleteAccount.js', () => ({ deleteAccount }))
vi.mock('@/lib/history/localHistoryStore.js', () => ({
  localHistoryStore: { clear: vi.fn().mockResolvedValue(undefined) },
}))
vi.mock('@/components/Seo.jsx', () => ({ default: () => null }))

function renderPage() {
  return render(
    <QueryClientProvider client={new QueryClient()}>
      <DeleteAccountPage />
    </QueryClientProvider>,
  )
}

describe('DeleteAccountPage', () => {
  beforeEach(() => {
    auth.loading = false
    auth.session = null
    auth.user = null
    auth.signOut.mockReset().mockResolvedValue({ error: null })
    deleteAccount.mockReset()
  })

  it('shows public deletion instructions and contact fallback when signed out', () => {
    renderPage()
    expect(screen.getByRole('heading', { name: 'Delete your Focamai account' })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'contact@focamai.com' })).toHaveAttribute('href', 'mailto:contact@focamai.com')
    expect(screen.queryByRole('button', { name: 'Delete account' })).not.toBeInTheDocument()
  })

  it('requires confirmation and completes authenticated deletion', async () => {
    auth.user = { email: 'person@example.com' }
    auth.session = { access_token: 'access-token' }
    deleteAccount.mockResolvedValue({ ok: true })
    renderPage()

    fireEvent.click(screen.getByRole('button', { name: 'Delete account' }))
    expect(screen.getByText(/cannot be undone/i)).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: /permanently delete/i }))

    await waitFor(() => expect(deleteAccount).toHaveBeenCalledWith('access-token'))
    expect(auth.signOut).toHaveBeenCalledWith({ scope: 'local' })
    expect(screen.getByRole('status')).toHaveTextContent(/has been deleted/i)
  })

  it('keeps the account screen retryable after a deletion failure', async () => {
    auth.user = { email: 'person@example.com' }
    auth.session = { access_token: 'access-token' }
    deleteAccount.mockRejectedValue(new Error('Temporary deletion failure.'))
    renderPage()

    fireEvent.click(screen.getByRole('button', { name: 'Delete account' }))
    fireEvent.click(screen.getByRole('button', { name: /permanently delete/i }))

    expect(await screen.findByRole('alert')).toHaveTextContent('Temporary deletion failure.')
    expect(screen.getByRole('button', { name: /permanently delete/i })).toBeEnabled()
  })
})
