import { createHistoryEntry } from '@/lib/history/historyEntry.js'

const STORAGE_KEY = 'focamai:searchHistory:v1'
const MAX_HISTORY_ENTRIES = 50

function canUseLocalStorage() {
  return typeof window !== 'undefined' && Boolean(window.localStorage)
}

function readEntries() {
  if (!canUseLocalStorage()) return []

  try {
    const rawValue = window.localStorage.getItem(STORAGE_KEY)
    if (!rawValue) return []

    const parsed = JSON.parse(rawValue)
    if (!Array.isArray(parsed)) return []

    return parsed
      .filter((entry) => entry && typeof entry === 'object' && entry.queryKey && entry.query)
      .sort((a, b) => String(b.updatedAt || '').localeCompare(String(a.updatedAt || '')))
  } catch {
    return []
  }
}

function writeEntries(entries) {
  if (!canUseLocalStorage()) return

  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(entries.slice(0, MAX_HISTORY_ENTRIES)))
  } catch {
    // History is helpful but optional. Quota/privacy failures should not block search.
  }
}

export const localHistoryStore = {
  async list() {
    return readEntries()
  },

  async save(entryInput) {
    const entry = createHistoryEntry(entryInput)
    const entries = readEntries()
    const existingEntry = entries.find((item) => item.queryKey === entry.queryKey)
    const savedEntry = {
      ...entry,
      id: existingEntry?.id || entry.id,
      createdAt: existingEntry?.createdAt || entry.createdAt,
      updatedAt: new Date().toISOString(),
    }
    const nextEntries = [
      savedEntry,
      ...entries.filter((item) => item.queryKey !== entry.queryKey),
    ].slice(0, MAX_HISTORY_ENTRIES)

    writeEntries(nextEntries)
    return savedEntry
  },

  async remove(id) {
    const entryId = String(id || '')
    writeEntries(readEntries().filter((entry) => entry.id !== entryId))
  },

  async clear() {
    writeEntries([])
  },
}
