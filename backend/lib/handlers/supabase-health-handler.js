import { getSupabaseHealth } from '../search-storage.js'
import { sendJson } from '../http.js'

export function createSupabaseHealthHandler() {
  return async function handleSupabaseHealth(response) {
    const health = await getSupabaseHealth()

    if (!health.configured) {
      sendJson(response, 200, {
        ...health,
        storageMode: 'local_file_fallback',
        status: 'optional',
        details: 'Supabase is not configured. The app is using the supported local cache/history fallback for this environment.',
        setupHint: 'Add SUPABASE_URL and SUPABASE_SECRET_KEY or the legacy SUPABASE_SERVICE_ROLE_KEY to enable Supabase-backed storage.',
      })
      return
    }

    sendJson(response, health.ok ? 200 : 500, {
      ...health,
      storageMode: 'supabase',
      status: health.ok ? 'ok' : 'error',
    })
  }
}
