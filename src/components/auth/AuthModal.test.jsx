import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import AuthModal from './AuthModal.jsx'

const auth = vi.hoisted(() => ({
  configured: true,
  dismissPasswordRecovery: vi.fn(),
  loading: false,
  passwordRecoveryActive: false,
  requestPasswordReset: vi.fn(),
  signIn: vi.fn(),
  signInWithApple: vi.fn(),
  signInWithGoogle: vi.fn(),
  signUp: vi.fn(),
  updatePassword: vi.fn(),
}))

vi.mock('@/contexts/useAuth.js', () => ({
  useAuth: () => auth,
}))

describe('AuthModal password recovery', () => {
  beforeEach(() => {
    auth.passwordRecoveryActive = false
    auth.requestPasswordReset.mockReset().mockResolvedValue({ error: null })
    auth.updatePassword.mockReset().mockResolvedValue({ error: null })
    auth.dismissPasswordRecovery.mockReset()
    auth.signInWithApple.mockReset().mockResolvedValue({ error: null })
    auth.signInWithGoogle.mockReset().mockResolvedValue({ error: null })
  })

  it('sends a password reset email from the sign-in screen', async () => {
    const user = userEvent.setup()

    render(<AuthModal open onClose={vi.fn()} />)

    await user.click(screen.getByRole('button', { name: /forgot password/i }))
    await user.type(screen.getByLabelText(/email/i), ' person@example.com ')
    await user.click(screen.getByRole('button', { name: /send reset link/i }))

    expect(auth.requestPasswordReset).toHaveBeenCalledWith({ email: 'person@example.com' })
    expect(screen.getByRole('status')).toHaveTextContent(/if an account exists/i)
  })

  it('requires matching passwords before completing a recovery session', async () => {
    const user = userEvent.setup()
    const onClose = vi.fn()
    auth.passwordRecoveryActive = true

    render(<AuthModal open onClose={onClose} />)

    await user.type(screen.getByLabelText(/^new password$/i), 'new-password')
    await user.type(screen.getByLabelText(/confirm new password/i), 'different-password')
    await user.click(screen.getByRole('button', { name: /save new password/i }))

    expect(screen.getByRole('alert')).toHaveTextContent(/passwords do not match/i)
    expect(auth.updatePassword).not.toHaveBeenCalled()

    await user.clear(screen.getByLabelText(/confirm new password/i))
    await user.type(screen.getByLabelText(/confirm new password/i), 'new-password')
    await user.click(screen.getByRole('button', { name: /save new password/i }))

    expect(auth.updatePassword).toHaveBeenCalledWith({ password: 'new-password' })
    expect(onClose).toHaveBeenCalled()
  })

  it('starts Google OAuth while Apple remains unavailable in the UI', async () => {
    const user = userEvent.setup()

    render(<AuthModal open onClose={vi.fn()} />)

    await user.click(screen.getByRole('button', { name: /continue with google/i }))
    expect(auth.signInWithGoogle).toHaveBeenCalledTimes(1)
    expect(screen.queryByRole('button', { name: /continue with apple/i })).not.toBeInTheDocument()
    expect(auth.signInWithApple).not.toHaveBeenCalled()
  })
})
