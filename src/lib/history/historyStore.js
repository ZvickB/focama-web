import { localHistoryStore } from '@/lib/history/localHistoryStore.js'

export function getHistoryStore() {
  return localHistoryStore
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
