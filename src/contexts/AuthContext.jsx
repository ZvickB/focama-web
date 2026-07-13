import { useCallback, useEffect, useMemo, useState } from 'react'

import { getSupabaseClient, isSupabaseAuthConfigured } from '@/lib/supabase.js'
import { AuthContext } from '@/contexts/useAuth.js'
import { createRemoteHistoryStore } from '@/lib/history/remoteHistoryStore.js'
import { setHistoryStore } from '@/lib/history/historyStore.js'
import { localHistoryStore, readLocalHistoryEntries } from '@/lib/history/localHistoryStore.js'
import { loadRemoteRankingPreference, saveRemoteRankingPreference } from '@/lib/preferences/rankingPreferenceStore.js'
import { normalizeRankingPreference, RANKING_PREFERENCES } from '../../shared/ranking-preference.js'

async function migrateLocalHistoryToAccount(remoteHistoryStore) {
  const localEntries = await localHistoryStore.list()

  if (localEntries.length === 0) {
    return
  }

  for (const entry of localEntries) {
    await remoteHistoryStore.save(entry)
  }

  await localHistoryStore.clear()
}

function isPasswordRecoveryUrl() {
  if (typeof window === 'undefined') return false

  const hashParams = new URLSearchParams(window.location.hash.replace(/^#/, ''))
  return window.location.pathname === '/reset-password' || hashParams.get('type') === 'recovery'
}

export function AuthProvider({ children }) {
  const [session, setSession] = useState(null)
  const [loading, setLoading] = useState(isSupabaseAuthConfigured)
  const [passwordRecoveryActive, setPasswordRecoveryActive] = useState(isPasswordRecoveryUrl)
  const [rankingPreference, setRankingPreferenceState] = useState(RANKING_PREFERENCES.BALANCED)
  const [rankingPreferenceLoading, setRankingPreferenceLoading] = useState(false)
  const [rankingPreferenceError, setRankingPreferenceError] = useState('')

  useEffect(() => {
    if (!isSupabaseAuthConfigured) {
      return undefined
    }

    let isMounted = true
    let subscription = null

    getSupabaseClient().then((client) => {
      if (!client || !isMounted) return

      client.auth.getSession().then(({ data }) => {
        if (!isMounted) return
        setSession(data.session || null)
        setLoading(false)
      })

    const { data: subscriptionData } = client.auth.onAuthStateChange((event, nextSession) => {
      setSession(nextSession || null)
      setLoading(false)
      if (event === 'PASSWORD_RECOVERY') {
        setPasswordRecoveryActive(true)
      }
    })
      subscription = subscriptionData.subscription
    })

    return () => {
      isMounted = false
      subscription?.unsubscribe()
    }
  }, [])

  useEffect(() => {
    if (!session?.user?.id) {
      setHistoryStore(localHistoryStore)
      setRankingPreferenceState(RANKING_PREFERENCES.BALANCED)
      setRankingPreferenceLoading(false)
      setRankingPreferenceError('')
      return undefined
    }

    let isCancelled = false

    getSupabaseClient().then(async (client) => {
      if (!client || isCancelled) return

      const remoteHistoryStore = createRemoteHistoryStore({
        client,
        userId: session.user.id,
      })

      setHistoryStore(remoteHistoryStore)

      try {
        if (readLocalHistoryEntries().length > 0) {
          await migrateLocalHistoryToAccount(remoteHistoryStore)
          if (!isCancelled) {
            setHistoryStore(remoteHistoryStore)
          }
        }
      } catch {
        // Keep local history intact if the account migration fails.
      }
    })

    return () => {
      isCancelled = true
    }
  }, [session?.user?.id])

  useEffect(() => {
    if (!session?.user?.id) {
      return undefined
    }

    let isCancelled = false
    setRankingPreferenceLoading(true)
    setRankingPreferenceError('')

    getSupabaseClient().then(async (client) => {
      if (!client || isCancelled) return

      try {
        const remotePreference = await loadRemoteRankingPreference({
          client,
          userId: session.user.id,
        })
        if (!isCancelled) {
          setRankingPreferenceState(remotePreference)
        }
      } catch {
        if (!isCancelled) {
          setRankingPreferenceState(RANKING_PREFERENCES.BALANCED)
          setRankingPreferenceError('Preference sync is temporarily unavailable.')
        }
      } finally {
        if (!isCancelled) {
          setRankingPreferenceLoading(false)
        }
      }
    })

    return () => {
      isCancelled = true
    }
  }, [session?.user?.id])

  const setRankingPreference = useCallback(async (nextValue) => {
    const nextPreference = normalizeRankingPreference(nextValue)

    if (!session?.user?.id) {
      return { error: new Error('Sign in to save preferences.') }
    }

    setRankingPreferenceState(nextPreference)
    setRankingPreferenceError('')

    try {
      const client = await getSupabaseClient()
      const savedPreference = await saveRemoteRankingPreference({
        client,
        userId: session.user.id,
        rankingPreference: nextPreference,
      })
      setRankingPreferenceState(savedPreference)
      return { error: null }
    } catch (error) {
      setRankingPreferenceError('Preference sync is temporarily unavailable.')
      return { error }
    }
  }, [session?.user?.id])

  const signIn = useCallback(async ({ email, password }) => {
    const client = await getSupabaseClient()
    if (!client) {
      return { error: new Error('Supabase auth is not configured.') }
    }

    return client.auth.signInWithPassword({ email, password })
  }, [])

  const signUp = useCallback(async ({ email, password }) => {
    const client = await getSupabaseClient()
    if (!client) {
      return { error: new Error('Supabase auth is not configured.') }
    }

    return client.auth.signUp({ email, password })
  }, [])

  const requestPasswordReset = useCallback(async ({ email }) => {
    const client = await getSupabaseClient()
    if (!client) {
      return { error: new Error('Supabase auth is not configured.') }
    }

    return client.auth.resetPasswordForEmail(email, {
      redirectTo: `${window.location.origin}/reset-password`,
    })
  }, [])

  const updatePassword = useCallback(async ({ password }) => {
    const client = await getSupabaseClient()
    if (!client) {
      return { error: new Error('Supabase auth is not configured.') }
    }

    const result = await client.auth.updateUser({ password })
    if (!result.error) {
      setPasswordRecoveryActive(false)
    }
    return result
  }, [])

  const dismissPasswordRecovery = useCallback(() => {
    setPasswordRecoveryActive(false)
  }, [])

  const signInWithOAuthProvider = useCallback(async (provider) => {
    const client = await getSupabaseClient()
    if (!client) {
      return { error: new Error('Supabase auth is not configured.') }
    }

    return client.auth.signInWithOAuth({
      provider,
      options: {
        redirectTo: window.location.origin,
      },
    })
  }, [])

  const signInWithGoogle = useCallback(() => signInWithOAuthProvider('google'), [signInWithOAuthProvider])

  const signInWithApple = useCallback(() => signInWithOAuthProvider('apple'), [signInWithOAuthProvider])

  const signOut = useCallback(async (options) => {
    const client = await getSupabaseClient()
    if (!client) {
      return { error: null }
    }

    return client.auth.signOut(options)
  }, [])

  const value = useMemo(
    () => ({
      configured: isSupabaseAuthConfigured,
      dismissPasswordRecovery,
      loading,
      passwordRecoveryActive,
      rankingPreference,
      rankingPreferenceError,
      rankingPreferenceLoading,
      requestPasswordReset,
      setRankingPreference,
      session,
      signIn,
      signInWithApple,
      signInWithGoogle,
      signOut,
      signUp,
      updatePassword,
      user: session?.user || null,
    }),
    [
      dismissPasswordRecovery,
      loading,
      passwordRecoveryActive,
      rankingPreference,
      rankingPreferenceError,
      rankingPreferenceLoading,
      requestPasswordReset,
      setRankingPreference,
      session,
      signIn,
      signInWithApple,
      signInWithGoogle,
      signOut,
      signUp,
      updatePassword,
    ],
  )

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}
