import { useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'

import PageShell from '@/components/PageShell.jsx'
import Seo from '@/components/Seo.jsx'
import { useAuth } from '@/contexts/useAuth.js'
import { deleteAccount } from '@/lib/account/deleteAccount.js'
import { localHistoryStore } from '@/lib/history/localHistoryStore.js'

function DeleteAccountPage() {
  const { loading, session, signOut, user } = useAuth()
  const queryClient = useQueryClient()
  const [confirming, setConfirming] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [error, setError] = useState('')
  const [deleted, setDeleted] = useState(false)

  async function handleDelete() {
    setDeleting(true)
    setError('')

    try {
      await deleteAccount(session?.access_token)
      await localHistoryStore.clear()
      queryClient.clear()
      await signOut({ scope: 'local' })
      setDeleted(true)
      setConfirming(false)
    } catch (deleteError) {
      setError(deleteError instanceof Error ? deleteError.message : 'We could not delete your account. Please try again.')
    } finally {
      setDeleting(false)
    }
  }

  return (
    <>
      <Seo
        title="Delete your Focamai account"
        description="Delete your Focamai account and its account-associated saved searches, price watches, and price comparison usage record."
        path="/delete-account"
      />
      <PageShell
        eyebrow="Account deletion"
        title="Delete your Focamai account"
        description="This permanent action deletes your Supabase authentication account and account-associated data."
      >
        <p>
          Deletion removes your Supabase authentication account, account preferences, saved searches,
          price watches, and price comparison usage record. It also clears saved-search history stored
          locally in this browser after deletion succeeds.
        </p>
        <p>
          Some records are not deleted by this control because they are not reliably linked to a
          Supabase account: anonymous operational search logs, analytics, diagnostics, search caches,
          hashed rate-limit records, hosting logs, feedback, and records held by service providers.
          We do not use those records to recreate your account after deletion.
        </p>
        <p>
          Search-cache entries are marked to expire from active use after 24 hours, but the current
          code does not automatically purge the underlying database row. The code also does not set
          one automatic retention period for the other retained records. They may remain only as
          necessary for security, fraud prevention, legal compliance, service integrity, or provider
          operations, and are removed or anonymized through maintenance or a valid privacy request
          when Focamai can identify the relevant record. Provider-held records follow the applicable
          provider policy and account configuration, including any longer retention required for
          legal or misuse-prevention reasons.
        </p>

        {deleted ? (
          <div role="status" className="rounded-2xl border border-teal-200 bg-teal-50 p-4 text-teal-900">
            Your Focamai account has been deleted and this browser has been signed out.
          </div>
        ) : loading ? (
          <p role="status">Checking your sign-in status…</p>
        ) : !user ? (
          <div className="space-y-3">
            <p>Sign in to Focamai, then return to this page to delete your account immediately.</p>
            <p>
              If you cannot sign in, email{' '}
              <a className="font-semibold text-primary underline underline-offset-4" href="mailto:contact@focamai.com">
                contact@focamai.com
              </a>{' '}
              for account-deletion help. We may need to verify your identity.
            </p>
          </div>
        ) : confirming ? (
          <div className="space-y-4 rounded-2xl border border-red-200 bg-red-50 p-5">
            <p className="font-semibold text-red-900">This cannot be undone. Delete {user.email}?</p>
            <div className="flex flex-wrap gap-3">
              <button
                className="rounded-full bg-red-700 px-5 py-2.5 font-semibold text-white disabled:opacity-60"
                disabled={deleting}
                onClick={handleDelete}
                type="button"
              >
                {deleting ? 'Deleting account…' : 'Yes, permanently delete my account'}
              </button>
              <button
                className="rounded-full border border-stone-300 bg-white px-5 py-2.5 font-semibold text-slate-700"
                disabled={deleting}
                onClick={() => setConfirming(false)}
                type="button"
              >
                Cancel
              </button>
            </div>
          </div>
        ) : (
          <button
            className="rounded-full bg-red-700 px-5 py-2.5 font-semibold text-white"
            onClick={() => setConfirming(true)}
            type="button"
          >
            Delete account
          </button>
        )}

        {error ? <p role="alert" className="text-red-700">{error}</p> : null}
      </PageShell>
    </>
  )
}

export default DeleteAccountPage
