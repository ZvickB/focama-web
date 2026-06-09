const supabaseUrl = import.meta.env.VITE_SUPABASE_URL
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY

export const isSupabaseAuthConfigured = Boolean(supabaseUrl && supabaseAnonKey)

let clientPromise = null

export async function getSupabaseClient() {
  if (!isSupabaseAuthConfigured) {
    return null
  }

  if (!clientPromise) {
    clientPromise = import('@supabase/supabase-js').then(({ createClient }) =>
      createClient(supabaseUrl, supabaseAnonKey, {
      auth: {
        autoRefreshToken: true,
        detectSessionInUrl: true,
        persistSession: true,
      },
      }),
    )
  }

  return clientPromise
}
