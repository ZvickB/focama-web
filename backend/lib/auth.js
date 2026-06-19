import { getSupabaseAdminClient } from './storage/supabase-client.js'

function readBearerToken(headers = {}) {
  const authorization = headers.authorization || headers.Authorization || ''
  const match = /^Bearer\s+(.+)$/i.exec(String(authorization).trim())
  return match?.[1]?.trim() || ''
}

export async function resolveOptionalAuthenticatedUser(request, deps = {}) {
  const token = readBearerToken(request?.headers)
  if (!token) return null

  const supabase = deps.supabase || getSupabaseAdminClient()
  if (!supabase?.auth?.getUser) return null

  try {
    const { data, error } = await supabase.auth.getUser(token)
    if (error || !data?.user?.id) return null
    return data.user
  } catch {
    return null
  }
}
