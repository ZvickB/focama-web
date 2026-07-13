import { useCallback, useEffect, useId, useState } from 'react'
import { Eye, EyeOff, LoaderCircle, LockKeyhole, X } from 'lucide-react'

import { Button } from '@/components/ui/button.jsx'
import { useAuth } from '@/contexts/useAuth.js'

// Keep the OAuth path ready while Apple Developer configuration is pending.
const APPLE_SIGN_IN_VISIBLE = false

function getAuthErrorMessage(error) {
  if (!error) return ''
  return error.message || 'Something went wrong. Please try again.'
}

export function AuthModal({ contextualLine = '', onClose, open }) {
  const emailId = useId()
  const passwordId = useId()
  const confirmPasswordId = useId()
  const {
    configured,
    dismissPasswordRecovery,
    loading: authLoading,
    passwordRecoveryActive,
    requestPasswordReset,
    signIn,
    signInWithApple,
    signInWithGoogle,
    signUp,
    updatePassword,
  } = useAuth()
  const [mode, setMode] = useState('sign-in')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [errorMessage, setErrorMessage] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [statusMessage, setStatusMessage] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const activeMode = passwordRecoveryActive ? 'reset-password' : mode

  const handleClose = useCallback(() => {
    if (passwordRecoveryActive) {
      dismissPasswordRecovery()
    }
    setMode('sign-in')
    setErrorMessage('')
    setPassword('')
    setConfirmPassword('')
    setShowPassword(false)
    setStatusMessage('')
    setSubmitting(false)
    onClose()
  }, [dismissPasswordRecovery, onClose, passwordRecoveryActive])

  useEffect(() => {
    if (!open) return undefined

    function handleKeyDown(event) {
      if (event.key === 'Escape') {
        handleClose()
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [handleClose, open])

  if (!open) return null

  async function handleSubmit(event) {
    event.preventDefault()
    setErrorMessage('')
    setStatusMessage('')

    if (!configured) {
      setErrorMessage('Supabase auth is not configured yet. Add the frontend URL and anon key to enable sign in.')
      return
    }

    if (activeMode === 'reset-password' && password !== confirmPassword) {
      setErrorMessage('Passwords do not match.')
      return
    }

    setSubmitting(true)

    if (activeMode === 'forgot-password') {
      const { error } = await requestPasswordReset({ email: email.trim() })
      setSubmitting(false)

      if (error) {
        setErrorMessage(getAuthErrorMessage(error))
        return
      }

      setStatusMessage('If an account exists for that email, we sent a password reset link.')
      return
    }

    if (activeMode === 'reset-password') {
      const { error } = await updatePassword({ password })
      setSubmitting(false)

      if (error) {
        setErrorMessage(getAuthErrorMessage(error))
        return
      }

      handleClose()
      return
    }

    const authAction = activeMode === 'sign-in' ? signIn : signUp
    const { data, error } = await authAction({ email: email.trim(), password })
    setSubmitting(false)

    if (error) {
      setErrorMessage(getAuthErrorMessage(error))
      return
    }

    if (activeMode === 'sign-up' && !data?.session) {
      setStatusMessage('Check your email to confirm your account, then come back to sign in.')
      return
    }

    handleClose()
  }

  async function handleOAuthSignIn({ providerLabel, signInWithProvider }) {
    setErrorMessage('')
    setStatusMessage('')

    if (!configured) {
      setErrorMessage(`Supabase auth is not configured yet. Add the frontend URL and anon key to enable ${providerLabel} sign in.`)
      return
    }

    setSubmitting(true)
    const { error } = await signInWithProvider()
    setSubmitting(false)

    if (error) {
      setErrorMessage(getAuthErrorMessage(error))
    }
  }

  const title = {
    'forgot-password': 'Reset your password',
    'reset-password': 'Choose a new password',
    'sign-in': 'Sign in',
    'sign-up': 'Create account',
  }[activeMode]
  const submitLabel = {
    'forgot-password': 'Send reset link',
    'reset-password': 'Save new password',
    'sign-in': 'Sign in',
    'sign-up': 'Create account',
  }[activeMode]
  const description = activeMode === 'forgot-password'
    ? 'Enter your email and we’ll send you a secure reset link.'
    : activeMode === 'reset-password'
      ? 'Use at least 6 characters for your new password.'
      : contextualLine || 'Search stays open. Your saved searches can follow you across devices.'
  const isBusy = submitting || authLoading

  return (
    <div
      aria-labelledby="auth-modal-title"
      aria-modal="true"
      className="fixed inset-0 z-[80] flex items-start justify-center overflow-y-auto bg-[rgba(51,39,30,0.22)] px-4 py-6 backdrop-blur-[2px] sm:items-center sm:py-8"
      role="dialog"
    >
      <div className="my-auto w-full max-w-md rounded-[24px] border border-[#e4d7c6] bg-white p-5 shadow-[0_30px_100px_-48px_rgba(15,23,42,0.45)] sm:rounded-[28px] sm:p-6">
        <div className="flex items-start justify-between gap-4">
          <div className="flex items-start gap-3">
            <span className="mt-0.5 flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-[#eef7f6] text-primary">
              <LockKeyhole className="h-5 w-5" />
            </span>
            <div>
              <h2 id="auth-modal-title" className="text-xl font-semibold text-slate-950">
                {title}
              </h2>
              <p className="mt-1 text-sm leading-6 text-slate-500">
                {description}
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={handleClose}
            aria-label="Close sign in modal"
            className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-slate-400 transition hover:bg-stone-100 hover:text-slate-700"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {activeMode === 'sign-in' || activeMode === 'sign-up' ? (
          <div className="mt-5 grid grid-cols-2 rounded-full bg-stone-100 p-1" role="tablist" aria-label="Authentication mode">
          {[
            ['sign-in', 'Sign in'],
            ['sign-up', 'Create account'],
          ].map(([nextMode, label]) => (
            <button
              key={nextMode}
              type="button"
              role="tab"
              aria-selected={activeMode === nextMode}
              onClick={() => {
                setMode(nextMode)
                setErrorMessage('')
                setStatusMessage('')
              }}
              className={`h-10 rounded-full text-sm font-semibold transition ${
                activeMode === nextMode
                  ? 'bg-white text-slate-950 shadow-[0_8px_24px_-18px_rgba(15,23,42,0.35)]'
                  : 'text-slate-500 hover:text-slate-800'
              }`}
            >
              {label}
            </button>
          ))}
          </div>
        ) : null}

        {!configured ? (
          <div className="mt-5 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm leading-6 text-amber-800">
            Add the Supabase frontend URL and anon key before sign in can run.
          </div>
        ) : null}

        <form onSubmit={handleSubmit} className="mt-5 space-y-4">
          {activeMode !== 'reset-password' ? (
            <div className="space-y-2">
            <label htmlFor={emailId} className="text-sm font-semibold text-slate-700">
              Email
            </label>
            <input
              id={emailId}
              type="email"
              autoComplete="email"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              className="h-12 w-full rounded-2xl border border-[#e5dacb] bg-white px-4 text-base text-slate-900 outline-none transition placeholder:text-slate-400 focus:border-primary/50 focus:ring-4 focus:ring-primary/10"
              placeholder="you@example.com"
              required
            />
            </div>
          ) : null}
          {activeMode !== 'forgot-password' ? (
            <div className="space-y-2">
              <div className="flex items-center justify-between gap-3">
                <label htmlFor={passwordId} className="text-sm font-semibold text-slate-700">
                  {activeMode === 'reset-password' ? 'New password' : 'Password'}
                </label>
                {activeMode === 'sign-in' ? (
                  <button
                    type="button"
                    onClick={() => {
                      setMode('forgot-password')
                      setErrorMessage('')
                      setStatusMessage('')
                      setPassword('')
                    }}
                    className="text-sm font-semibold text-primary transition hover:text-primary/75"
                  >
                    Forgot password?
                  </button>
                ) : null}
              </div>
              <div className="relative">
              <input
                id={passwordId}
                type={showPassword ? 'text' : 'password'}
                autoComplete={activeMode === 'sign-in' ? 'current-password' : 'new-password'}
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                className="h-12 w-full rounded-2xl border border-[#e5dacb] bg-white py-0 pl-4 pr-12 text-base text-slate-900 outline-none transition placeholder:text-slate-400 focus:border-primary/50 focus:ring-4 focus:ring-primary/10"
                minLength={6}
                required
              />
              <button
                type="button"
                onClick={() => setShowPassword((current) => !current)}
                aria-label={showPassword ? 'Hide password' : 'Show password'}
                aria-pressed={showPassword}
                className="absolute right-2 top-1/2 inline-flex h-9 w-9 -translate-y-1/2 items-center justify-center rounded-full text-slate-400 transition hover:bg-stone-100 hover:text-slate-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/30"
              >
                {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
              </button>
              </div>
            </div>
          ) : null}

          {activeMode === 'reset-password' ? (
            <div className="space-y-2">
              <label htmlFor={confirmPasswordId} className="text-sm font-semibold text-slate-700">
                Confirm new password
              </label>
              <input
                id={confirmPasswordId}
                type={showPassword ? 'text' : 'password'}
                autoComplete="new-password"
                value={confirmPassword}
                onChange={(event) => setConfirmPassword(event.target.value)}
                className="h-12 w-full rounded-2xl border border-[#e5dacb] bg-white px-4 text-base text-slate-900 outline-none transition placeholder:text-slate-400 focus:border-primary/50 focus:ring-4 focus:ring-primary/10"
                minLength={6}
                required
              />
            </div>
          ) : null}

          {errorMessage ? (
            <p role="alert" className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm leading-6 text-red-700">
              {errorMessage}
            </p>
          ) : null}
          {statusMessage ? (
            <p role="status" className="rounded-2xl border border-[#d9e6e8] bg-[#eef7f6] px-4 py-3 text-sm leading-6 text-primary">
              {statusMessage}
            </p>
          ) : null}

          <Button
            type="submit"
            disabled={isBusy}
            className="h-12 w-full rounded-2xl text-base"
          >
            {isBusy ? <LoaderCircle className="mr-2 h-4 w-4 animate-spin" /> : null}
            {submitLabel}
          </Button>

          {activeMode === 'forgot-password' ? (
            <button
              type="button"
              onClick={() => {
                setMode('sign-in')
                setErrorMessage('')
                setStatusMessage('')
              }}
              className="w-full text-sm font-semibold text-slate-500 transition hover:text-slate-800"
            >
              Back to sign in
            </button>
          ) : null}
        </form>

        {activeMode === 'sign-in' || activeMode === 'sign-up' ? (
          <>
            <div className="my-5 flex items-center gap-3">
          <span className="h-px flex-1 bg-stone-200" />
          <span className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-400">
            Or
          </span>
          <span className="h-px flex-1 bg-stone-200" />
            </div>

            <div className="space-y-3">
              <button
                type="button"
                onClick={() => handleOAuthSignIn({
                  providerLabel: 'Google',
                  signInWithProvider: signInWithGoogle,
                })}
                disabled={isBusy}
                className="inline-flex h-12 w-full items-center justify-center rounded-2xl border border-[#e5dacb] bg-white px-4 text-sm font-semibold text-slate-700 transition hover:border-[#d5c7b6] hover:bg-stone-50 disabled:pointer-events-none disabled:opacity-50"
              >
                Continue with Google
              </button>
              {APPLE_SIGN_IN_VISIBLE ? (
                <button
                  type="button"
                  onClick={() => handleOAuthSignIn({
                    providerLabel: 'Apple',
                    signInWithProvider: signInWithApple,
                  })}
                  disabled={isBusy}
                  className="inline-flex h-12 w-full items-center justify-center rounded-2xl bg-slate-950 px-4 text-sm font-semibold text-white transition hover:bg-slate-800 disabled:pointer-events-none disabled:opacity-50"
                >
                  Continue with Apple
                </button>
              ) : null}
            </div>
          </>
        ) : null}
      </div>
    </div>
  )
}

export default AuthModal
