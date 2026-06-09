import { createContext, useContext } from 'react'

export const AuthContext = createContext(null)

const fallback = {
  configured: false,
  loading: false,
  session: null,
  signIn: async () => ({ error: new Error('Supabase auth is not configured.') }),
  signInWithGoogle: async () => ({ error: new Error('Supabase auth is not configured.') }),
  signOut: async () => ({ error: null }),
  signUp: async () => ({ error: new Error('Supabase auth is not configured.') }),
  user: null,
}

export function useAuth() {
  return useContext(AuthContext) ?? fallback
}
