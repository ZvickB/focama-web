const MAX_ENTRIES = 200
const store = new Map()

export function memoryGet(key) {
  const entry = store.get(key)

  if (!entry) {
    return undefined
  }

  if (!Number.isFinite(entry.expiresAt) || entry.expiresAt <= Date.now()) {
    store.delete(key)
    return undefined
  }

  store.delete(key)
  store.set(key, entry)
  return entry.value
}

export function memorySet(key, value, ttlMs) {
  if (!key || !Number.isFinite(ttlMs) || ttlMs <= 0) {
    return
  }

  if (store.has(key)) {
    store.delete(key)
  }

  store.set(key, {
    value,
    expiresAt: Date.now() + ttlMs,
  })

  while (store.size > MAX_ENTRIES) {
    const oldestKey = store.keys().next().value

    if (typeof oldestKey === 'undefined') {
      break
    }

    store.delete(oldestKey)
  }
}

export function memoryClear() {
  store.clear()
}
