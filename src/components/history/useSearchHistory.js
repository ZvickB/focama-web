import { useCallback, useEffect, useState } from 'react'

import { historyStore } from '@/lib/history/historyStore.js'

export function useSearchHistory() {
  const [entries, setEntries] = useState([])
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(true)

  const refresh = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      setEntries(await historyStore.list())
    } catch (listError) {
      setError(listError?.message || 'Unable to load search history.')
      setEntries([])
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void refresh()
  }, [refresh])

  useEffect(() => {
    function handleHistoryStoreChanged() {
      void refresh()
    }

    window.addEventListener('focamai:history-store-changed', handleHistoryStoreChanged)
    return () => window.removeEventListener('focamai:history-store-changed', handleHistoryStoreChanged)
  }, [refresh])

  const save = useCallback(async (entry) => {
    const savedEntry = await historyStore.save(entry)
    await refresh()
    return savedEntry
  }, [refresh])

  const remove = useCallback(async (id) => {
    await historyStore.remove(id)
    await refresh()
  }, [refresh])

  const clear = useCallback(async () => {
    await historyStore.clear()
    await refresh()
  }, [refresh])

  return {
    clear,
    entries,
    error,
    loading,
    refresh,
    remove,
    save,
  }
}
