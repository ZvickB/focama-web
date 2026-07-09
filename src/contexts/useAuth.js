import { createContext, useContext } from 'react'

export const AuthContext = createContext(null)

const fallback = {
  configured: false,
  dismissPasswordRecovery: () => {},
  loading: false,
  passwordRecoveryActive: false,
  rankingPreference: 'balanced',
  rankingPreferenceError: '',
  rankingPreferenceLoading: false,
  requestPasswordReset: async () => ({ error: new Error('Supabase auth is not configured.') }),
  setRankingPreference: async () => ({ error: new Error('Sign in to save preferences.') }),
  session: null,
  signIn: async () => ({ error: new Error('Supabase auth is not configured.') }),
  signInWithApple: async () => ({ error: new Error('Supabase auth is not configured.') }),
  signInWithGoogle: async () => ({ error: new Error('Supabase auth is not configured.') }),
  signOut: async () => ({ error: null }),
  signUp: async () => ({ error: new Error('Supabase auth is not configured.') }),
  updatePassword: async () => ({ error: new Error('Supabase auth is not configured.') }),
  user: null,
}

export function useAuth() {
  return useContext(AuthContext) ?? fallback
}
