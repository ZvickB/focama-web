import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'
import {
  getSupabaseAdminClient,
  isSupabaseConfigured,
  logStorageWarning,
  TESTER_FEEDBACK_TABLE,
} from './supabase-client.js'

const TESTER_FEEDBACK_PATH = resolve(process.cwd(), 'temp-data', 'tester-feedback.json')

export function readLocalTesterFeedbackFile() {
  if (!existsSync(TESTER_FEEDBACK_PATH)) {
    return { entries: [] }
  }

  try {
    const fileContents = readFileSync(TESTER_FEEDBACK_PATH, 'utf8')
    const parsed = JSON.parse(fileContents)

    if (!parsed || typeof parsed !== 'object' || !Array.isArray(parsed.entries)) {
      return { entries: [] }
    }

    return parsed
  } catch {
    return { entries: [] }
  }
}

export function normalizeFeedbackValue(value) {
  if (typeof value !== 'string') {
    return 'unknown'
  }

  const normalized = value.trim().toLowerCase()
  return normalized || 'unknown'
}

export async function recordTesterFeedback(feedback) {
  const payload = {
    email: feedback?.email || null,
    finalized: Boolean(feedback?.finalized),
    found_what_you_wanted: feedback?.foundWhatYouWanted || null,
    free_text: feedback?.freeText || null,
    enjoyed_experience: feedback?.enjoyedExperience || null,
    metadata:
      feedback?.metadata && typeof feedback.metadata === 'object' && !Array.isArray(feedback.metadata)
        ? feedback.metadata
        : {},
    page: feedback?.page || '/',
    query_text: feedback?.queryText || null,
    results_seen: Boolean(feedback?.resultsSeen),
    search_id: feedback?.searchId || null,
    selected_product_id: feedback?.selectedProductId || null,
    session_id: feedback?.sessionId || null,
    stage_reached: feedback?.stageReached || 'home',
    was_simple: feedback?.wasSimple || null,
  }

  if (isSupabaseConfigured()) {
    try {
      const supabase = getSupabaseAdminClient()
      const { error } = await supabase.from(TESTER_FEEDBACK_TABLE).insert(payload)

      if (!error) {
        return
      }

      throw error
    } catch (error) {
      logStorageWarning('Tester feedback write fell back to local storage', error)
    }
  }

  try {
    mkdirSync(resolve(process.cwd(), 'temp-data'), { recursive: true })
    const existingFeedback = readLocalTesterFeedbackFile()
    const entries = Array.isArray(existingFeedback.entries) ? existingFeedback.entries : []
    entries.push({
      ...payload,
      created_at: new Date().toISOString(),
    })

    writeFileSync(
      TESTER_FEEDBACK_PATH,
      JSON.stringify({ entries }, null, 2),
    )
  } catch (error) {
    logStorageWarning('Tester feedback local write failed', error)
  }
}
