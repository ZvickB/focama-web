import { useEffect, useId, useState } from 'react'
import { Eye, EyeOff, LoaderCircle, LockKeyhole, X } from 'lucide-react'

import { Button } from '@/components/ui/button.jsx'
import { useAuth } from '@/contexts/useAuth.js'

function getAuthErrorMessage(error) {
  if (!error) return ''
  return error.message || 'Something went wrong. Please try again.'
}

export function AuthModal({ onClose, open }) {
  const emailId = useId()
  const passwordId = useId()
  const { configured, loading: authLoading, signIn, signInWithGoogle, signUp, user } = useAuth()
  const [mode, setMode] = useState('sign-in')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [errorMessage, setErrorMessage] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [statusMessage, setStatusMessage] = useState('')
  const [submitting, setSubmitting] = useState(false)

  useEffect(() => {
    if (open && user) {
      onClose()
    }
  }, [onClose, open, user])

  if (!open) return null

  function handleClose() {
    setErrorMessage('')
    setShowPassword(false)
    setStatusMessage('')
    setSubmitting(false)
    onClose()
  }

  async function handleSubmit(event) {
    event.preventDefault()
    setErrorMessage('')
    setStatusMessage('')

    if (!configured) {
      setErrorMessage('Supabase auth is not configured yet. Add the frontend URL and anon key to enable sign in.')
      return
    }

    setSubmitting(true)
    const authAction = mode === 'sign-in' ? signIn : signUp
    const { data, error } = await authAction({ email: email.trim(), password })
    setSubmitting(false)

    if (error) {
      setErrorMessage(getAuthErrorMessage(error))
      return
    }

    if (mode === 'sign-up' && !data?.session) {
      setStatusMessage('Check your email to confirm your account, then come back to sign in.')
      return
    }

    handleClose()
  }

  async function handleGoogleSignIn() {
    setErrorMessage('')
    setStatusMessage('')

    if (!configured) {
      setErrorMessage('Supabase auth is not configured yet. Add the frontend URL and anon key to enable Google sign in.')
      return
    }

    setSubmitting(true)
    const { error } = await signInWithGoogle()
    setSubmitting(false)

    if (error) {
      setErrorMessage(getAuthErrorMessage(error))
    }
  }

  const title = mode === 'sign-in' ? 'Sign in' : 'Create account'
  const submitLabel = mode === 'sign-in' ? 'Sign in' : 'Create account'
  const isBusy = submitting || authLoading

  return (
    <div
      aria-labelledby="auth-modal-title"
      aria-modal="true"
      className="fixed inset-0 z-[80] flex items-center justify-center bg-[rgba(51,39,30,0.22)] px-4 py-8 backdrop-blur-[2px]"
      role="dialog"
    >
      <div className="w-full max-w-md rounded-[28px] border border-[#e4d7c6] bg-white p-5 shadow-[0_30px_100px_-48px_rgba(15,23,42,0.45)] sm:p-6">
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
                Search stays open. Accounts will let you sync saved searches across devices.
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

        <div className="mt-5 grid grid-cols-2 rounded-full bg-stone-100 p-1">
          {[
            ['sign-in', 'Sign in'],
            ['sign-up', 'Create account'],
          ].map(([nextMode, label]) => (
            <button
              key={nextMode}
              type="button"
              onClick={() => {
                setMode(nextMode)
                setErrorMessage('')
                setStatusMessage('')
              }}
              className={`h-10 rounded-full text-sm font-semibold transition ${
                mode === nextMode
                  ? 'bg-white text-slate-950 shadow-[0_8px_24px_-18px_rgba(15,23,42,0.35)]'
                  : 'text-slate-500 hover:text-slate-800'
              }`}
            >
              {label}
            </button>
          ))}
        </div>

        {!configured ? (
          <div className="mt-5 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm leading-6 text-amber-800">
            Add `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` to the frontend environment before sign in can run.
          </div>
        ) : null}

        <form onSubmit={handleSubmit} className="mt-5 space-y-4">
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
          <div className="space-y-2">
            <label htmlFor={passwordId} className="text-sm font-semibold text-slate-700">
              Password
            </label>
            <div className="relative">
              <input
                id={passwordId}
                type={showPassword ? 'text' : 'password'}
                autoComplete={mode === 'sign-in' ? 'current-password' : 'new-password'}
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
        </form>

        <div className="my-5 flex items-center gap-3">
          <span className="h-px flex-1 bg-stone-200" />
          <span className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-400">
            Or
          </span>
          <span className="h-px flex-1 bg-stone-200" />
        </div>

        <button
          type="button"
          onClick={handleGoogleSignIn}
          disabled={isBusy}
          className="inline-flex h-12 w-full items-center justify-center rounded-2xl border border-[#e5dacb] bg-white px-4 text-sm font-semibold text-slate-700 transition hover:border-[#d5c7b6] hover:bg-stone-50 disabled:pointer-events-none disabled:opacity-50"
        >
          Continue with Google
        </button>
      </div>
    </div>
  )
}

export default AuthModal
