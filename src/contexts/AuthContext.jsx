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

    const { data: subscriptionData } = client.auth.onAuthStateChange((_event, nextSession) => {
      setSession(nextSession || null)
      setLoading(false)
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

  const signOut = useCallback(async () => {
    const client = await getSupabaseClient()
    if (!client) {
      return { error: null }
    }

    return client.auth.signOut()
  }, [])

  const value = useMemo(
    () => ({
      configured: isSupabaseAuthConfigured,
      loading,
      session,
      signIn,
      signInWithGoogle,
      signOut,
      signUp,
      user: session?.user || null,
    }),
    [loading, session, signIn, signInWithGoogle, signOut, signUp],
  )

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}
