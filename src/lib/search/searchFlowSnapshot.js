const STORAGE_KEY = 'focamai:searchFlowSnapshot:v1'
const SNAPSHOT_TTL_MS = 60 * 60 * 1000

function canUseLocalStorage() {
  return typeof window !== 'undefined' && Boolean(window.localStorage)
}

export function saveFlowSnapshot(snapshot) {
  if (!canUseLocalStorage()) return
  if (!snapshot || (snapshot.phase !== 'refine' && snapshot.phase !== 'results')) return

  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify({ ...snapshot, savedAt: Date.now() }))
  } catch {
    // Flow restoration is best-effort; a storage failure should not block search.
  }
}

export function readFlowSnapshot() {
  if (!canUseLocalStorage()) return null

  try {
    const rawValue = window.localStorage.getItem(STORAGE_KEY)
    if (!rawValue) return null

    const parsed = JSON.parse(rawValue)
    const savedAt = Number(parsed?.savedAt)

    if (!parsed || !Number.isFinite(savedAt) || Date.now() - savedAt > SNAPSHOT_TTL_MS) {
      clearFlowSnapshot()
      return null
    }

    if (!parsed.discoveryToken || !parsed.submittedQuery) {
      clearFlowSnapshot()
      return null
    }

    return parsed
  } catch {
    return null
  }
}

export function clearFlowSnapshot() {
  if (!canUseLocalStorage()) return

  try {
    window.localStorage.removeItem(STORAGE_KEY)
  } catch {
    // Best-effort cleanup only.
  }
}
