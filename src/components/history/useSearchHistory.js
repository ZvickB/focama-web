import { useCallback, useEffect, useState } from 'react'

import { historyStore } from '@/lib/history/historyStore.js'

export function useSearchHistory() {
  const [entries, setEntries] = useState([])
  const [loading, setLoading] = useState(true)

  const refresh = useCallback(async () => {
    setLoading(true)
    try {
      setEntries(await historyStore.list())
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void refresh()
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
    loading,
    refresh,
    remove,
    save,
  }
}
