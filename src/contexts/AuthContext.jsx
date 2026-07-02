import { useCallback, useEffect, useMemo, useState } from 'react'

import { getSupabaseClient, isSupabaseAuthConfigured } from '@/lib/supabase.js'
import { AuthContext } from '@/contexts/useAuth.js'
import { createRemoteHistoryStore } from '@/lib/history/remoteHistoryStore.js'
import { setHistoryStore } from '@/lib/history/historyStore.js'
import { localHistoryStore, readLocalHistoryEntries } from '@/lib/history/localHistoryStore.js'

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

export function AuthProvider({ children }) {
  const [session, setSession] = useState(null)
  const [loading, setLoading] = useState(isSupabaseAuthConfigured)
  const [passwordRecoveryActive, setPasswordRecoveryActive] = useState(false)

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
      redirectTo: window.location.origin,
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

  const signInWithGoogle = useCallback(async () => {
    const client = await getSupabaseClient()
    if (!client) {
      return { error: new Error('Supabase auth is not configured.') }
    }

    return client.auth.signInWithOAuth({
      provider: 'google',
      options: {
        redirectTo: window.location.origin,
      },
    })
  }, [])

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
      requestPasswordReset,
      session,
      signIn,
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
      requestPasswordReset,
      session,
      signIn,
      signInWithGoogle,
      signOut,
      signUp,
      updatePassword,
    ],
  )

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}
