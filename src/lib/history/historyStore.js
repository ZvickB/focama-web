import { localHistoryStore } from '@/lib/history/localHistoryStore.js'

let activeHistoryStore = localHistoryStore

function notifyHistoryStoreChanged() {
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent('focamai:history-store-changed'))
  }
}

export function getHistoryStore() {
  return activeHistoryStore
}

export function setHistoryStore(store = localHistoryStore) {
  activeHistoryStore = store
  notifyHistoryStoreChanged()
}

export const historyStore = {
  list(...args) {
    return getHistoryStore().list(...args)
  },
  save(...args) {
    return getHistoryStore().save(...args)
  },
  remove(...args) {
    return getHistoryStore().remove(...args)
  },
  clear(...args) {
    return getHistoryStore().clear(...args)
  },
}
