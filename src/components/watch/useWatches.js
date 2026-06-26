import { useCallback, useEffect, useState } from 'react'

import { watchStore } from '@/lib/watch/watchStore.js'

export function useWatches({ enabled = true } = {}) {
  const [watches, setWatches] = useState([])
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(Boolean(enabled))

  const refresh = useCallback(async () => {
    if (!enabled) {
      setWatches([])
      setError('')
      setLoading(false)
      return
    }

    setLoading(true)
    setError('')
    try {
      setWatches(await watchStore.list())
    } catch (listError) {
      setError(listError?.message || 'Unable to load price watches.')
      setWatches([])
    } finally {
      setLoading(false)
    }
  }, [enabled])

  useEffect(() => {
    void refresh()
  }, [refresh])

  const create = useCallback(async (watchInput) => {
    const savedWatch = await watchStore.create(watchInput)
    await refresh()
    return savedWatch
  }, [refresh])

  const update = useCallback(async (id, patch) => {
    const savedWatch = await watchStore.update(id, patch)
    await refresh()
    return savedWatch
  }, [refresh])

  const remove = useCallback(async (id) => {
    await watchStore.remove(id)
    await refresh()
  }, [refresh])

  return {
    create,
    error,
    loading,
    refresh,
    remove,
    update,
    watches,
  }
}
