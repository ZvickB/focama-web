export { isSupabaseConfigured, getSupabaseHealth } from './storage/supabase-client.js'
export { recordTesterFeedback } from './storage/feedback-storage.js'
export { readStoredSearchCacheEntry, writeStoredSearchCacheEntry } from './storage/search-cache-storage.js'
export { readProductDetailsCacheEntries, writeProductDetailsCacheEntries } from './storage/product-details-storage.js'
export {
  readAnalyticsDashboardData,
  readCachePoolEntries,
  recordAnalyticsResultClick,
  recordAnalyticsResultImpressions,
  recordAnalyticsSearchEvent,
  recordOxylabsProductFailures,
  recordSearchHistory,
  upsertAnalyticsSearchRun,
} from './storage/analytics-storage.js'
