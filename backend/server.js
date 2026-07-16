import { DEFAULT_RATE_LIMIT_CONFIG } from './lib/rate-limit.js'
import { reportBackendError } from './lib/observability.js'
import {
  handleAnalyticsDashboard,
  handleMobileAnalyticsTrack,
  handleAnalyticsTrack,
  handleCachePoolInspect,
  handleFinalizeHistory,
  handleSearchDebug,
} from './lib/handlers/analytics-handler.js'
import {
  handleCachedSearch,
  handleRainforestDiscoverySearch,
} from './lib/handlers/discovery-handler.js'
import {
  getRefinementModel,
  handleRefinementPrompt,
} from './lib/handlers/refine-handler.js'
import { handleFinalizeSelection } from './lib/handlers/finalize-handler.js'
import {
  handleQueryQualityPoll,
  startQueryQualityReview,
} from './lib/handlers/query-quality-handler.js'
import { handleDeepDive } from './lib/handlers/deep-dive-handler.js'
import {
  applyLateProductDetailsToEnrichment,
  handleEnrichmentPoll,
  handleEnrichmentStream,
  mergeProductDetailsIntoCandidatePool,
  runMiniEnrichmentAsync,
} from './lib/handlers/enrichment-handler.js'
import { handleProductDetails } from './lib/handlers/product-details-handler.js'
import { createRetryAdviceHandler } from './lib/handlers/retry-advice-handler.js'
import { createFeedbackHandler } from './lib/handlers/feedback-handler.js'
import { createSupabaseHealthHandler } from './lib/handlers/supabase-health-handler.js'
import { createInternalPriceWatchHandler } from './lib/handlers/price-watch-handler.js'
import { createAccountDeletionHandler } from './lib/handlers/account-deletion-handler.js'
import {
  handleConnectivityDiagnostic,
  handleHealth,
  handleSearchDiagnosticEvent,
} from './lib/handlers/diagnostics-handler.js'
import {
  FINALIZE_MAX_NOTE_LENGTH,
  FINALIZE_MAX_REJECTION_FEEDBACK_LENGTH,
  RATE_LIMIT_WAIT_MESSAGE,
  logSearchFlowEvent,
  nowMs,
} from './lib/server-helpers.js'

const RETRY_ADVICE_BODY_LIMIT_BYTES = 16 * 1024
const FEEDBACK_BODY_LIMIT_BYTES = 16 * 1024
const RETRY_ADVICE_MAX_SHORTLIST_ITEMS = 6
const RETRY_ADVICE_MAX_TITLE_LENGTH = 160
const FEEDBACK_MAX_SESSION_ID_LENGTH = 120
const FEEDBACK_MAX_SEARCH_ID_LENGTH = 100
const FEEDBACK_MAX_STAGE_LENGTH = 40
const FEEDBACK_MAX_PAGE_LENGTH = 120
const FEEDBACK_MAX_QUERY_LENGTH = 200
const FEEDBACK_MAX_FREE_TEXT_LENGTH = 2000
const FEEDBACK_MAX_EMAIL_LENGTH = 240
const FEEDBACK_MAX_SELECTED_PRODUCT_ID_LENGTH = 200

export const handleRetryAdvice = createRetryAdviceHandler({
  getRefinementModel,
  logSearchFlowEvent,
  nowMs,
  reportBackendError,
  rateLimitConfig: DEFAULT_RATE_LIMIT_CONFIG,
  bodyLimitBytes: RETRY_ADVICE_BODY_LIMIT_BYTES,
  maxNoteLength: FINALIZE_MAX_NOTE_LENGTH,
  maxRejectionFeedbackLength: FINALIZE_MAX_REJECTION_FEEDBACK_LENGTH,
  maxShortlistItems: RETRY_ADVICE_MAX_SHORTLIST_ITEMS,
  maxShortlistTitleLength: RETRY_ADVICE_MAX_TITLE_LENGTH,
  rateLimitWaitMessage: RATE_LIMIT_WAIT_MESSAGE,
})

export const handleFeedbackSubmission = createFeedbackHandler({
  bodyLimitBytes: FEEDBACK_BODY_LIMIT_BYTES,
  maxEmailLength: FEEDBACK_MAX_EMAIL_LENGTH,
  maxFreeTextLength: FEEDBACK_MAX_FREE_TEXT_LENGTH,
  maxPageLength: FEEDBACK_MAX_PAGE_LENGTH,
  maxQueryLength: FEEDBACK_MAX_QUERY_LENGTH,
  maxSearchIdLength: FEEDBACK_MAX_SEARCH_ID_LENGTH,
  maxSelectedProductIdLength: FEEDBACK_MAX_SELECTED_PRODUCT_ID_LENGTH,
  maxSessionIdLength: FEEDBACK_MAX_SESSION_ID_LENGTH,
  maxStageLength: FEEDBACK_MAX_STAGE_LENGTH,
})

export const handleSupabaseHealth = createSupabaseHealthHandler()
export const handleInternalPriceWatchCheck = createInternalPriceWatchHandler()
export const handleAccountDeletion = createAccountDeletionHandler()

export {
  handleMobileAnalyticsTrack,
  handleAnalyticsTrack,
  handleAnalyticsDashboard,
  handleCachePoolInspect,
  handleFinalizeHistory,
  handleSearchDebug,
  handleCachedSearch,
  handleRainforestDiscoverySearch,
  handleRefinementPrompt,
  handleFinalizeSelection,
  handleQueryQualityPoll,
  startQueryQualityReview,
  handleDeepDive,
  handleEnrichmentPoll,
  handleEnrichmentStream,
  runMiniEnrichmentAsync,
  mergeProductDetailsIntoCandidatePool,
  applyLateProductDetailsToEnrichment,
  handleProductDetails,
  handleSearchDiagnosticEvent,
  handleHealth,
  handleConnectivityDiagnostic,
}
