import { useCallback, useEffect, useMemo, useState } from 'react'

import { getSupabaseClient, isSupabaseAuthConfigured } from '@/lib/supabase.js'
import { AuthContext } from '@/contexts/useAuth.js'

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
