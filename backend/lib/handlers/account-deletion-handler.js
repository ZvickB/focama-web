import { verifySupabaseBearerToken } from '../auth.js'
import { sendJson } from '../http.js'
import { getSupabaseAdminClient } from '../storage/supabase-client.js'

function isAlreadyDeletedError(error) {
  return error?.status === 404 || error?.code === 'user_not_found'
}

export function createAccountDeletionHandler({
  getAdminClient = getSupabaseAdminClient,
  verifyToken = verifySupabaseBearerToken,
} = {}) {
  return async function handleAccountDeletion(request, response) {
    const auth = await verifyToken(request.headers || {})

    if (!auth.ok) {
      const unavailable = auth.reason === 'supabase_not_configured'
      sendJson(response, unavailable ? 503 : 401, {
        error: unavailable
          ? 'Account deletion is temporarily unavailable.'
          : 'A valid signed-in session is required to delete this account.',
      })
      return
    }

    const supabase = getAdminClient()
    if (!supabase?.auth?.admin?.deleteUser) {
      sendJson(response, 503, { error: 'Account deletion is temporarily unavailable.' })
      return
    }

    const { error } = await supabase.auth.admin.deleteUser(auth.user.id)

    if (error && !isAlreadyDeletedError(error)) {
      sendJson(response, 500, {
        error: 'We could not delete the account right now. No client-side cleanup was performed; please try again.',
      })
      return
    }

    sendJson(response, 200, {
      ok: true,
      status: 'deleted',
    })
  }
}
