import * as Sentry from '@sentry/node'
import { getEnv } from './search-data.js'

const SECRET_KEY_PATTERN = /(authorization|cookie|token|secret|password|api[-_]?key|dsn|signature)/i
const SECRET_VALUE_PATTERN =
  /\b(?:Bearer\s+[A-Za-z0-9._-]+|sk_[A-Za-z0-9_-]+|AIza[0-9A-Za-z_-]+|gh[pousr]_[A-Za-z0-9]+)\b/g
const SECRET_QUERY_PATTERN =
  /((?:token|secret|password|api[_-]?key|signature|dsn)=)[^&\s]+/gi

let observabilityInitialized = false
let sentryEnabled = false
let processHandlersRegistered = false

function sanitizeString(value, { maxLength = 600 } = {}) {
  if (typeof value !== 'string') {
    return value
  }

  const redactedValue = value
    .replace(SECRET_QUERY_PATTERN, '$1[redacted]')
    .replace(SECRET_VALUE_PATTERN, '[redacted]')

  if (redactedValue.length <= maxLength) {
    return redactedValue
  }

  return `${redactedValue.slice(0, maxLength)}...`
}

function sanitizeValue(value, depth = 0) {
  if (
    value === null ||
    value === undefined ||
    typeof value === 'boolean' ||
    typeof value === 'number'
  ) {
    return value
  }

  if (typeof value === 'string') {
    return sanitizeString(value)
  }

  if (value instanceof Error) {
    return {
      name: value.name,
      message: sanitizeString(value.message),
    }
  }

  if (Array.isArray(value)) {
    if (depth >= 2) {
      return `[array:${value.length}]`
    }

    return value.slice(0, 10).map((entry) => sanitizeValue(entry, depth + 1))
  }

  if (typeof value === 'object') {
    if (depth >= 2) {
      return '[object]'
    }

    return Object.fromEntries(
      Object.entries(value)
        .slice(0, 20)
        .map(([key, entryValue]) => [
          key,
          SECRET_KEY_PATTERN.test(key) ? '[redacted]' : sanitizeValue(entryValue, depth + 1),
        ]),
    )
  }

  return sanitizeString(String(value))
}

function sanitizeRequestData(requestData = {}) {
  return {
    method: requestData.method || undefined,
    url: sanitizeString(requestData.url || ''),
  }
}

function createErrorSummary(error) {
  if (error instanceof Error) {
    return {
      message: sanitizeString(error.message),
      name: error.name || 'Error',
    }
  }

  return {
    message: sanitizeString(typeof error === 'string' ? error : String(error)),
    name: 'NonErrorThrow',
  }
}

export function initObservability() {
  if (observabilityInitialized) {
    return {
      enabled: sentryEnabled,
    }
  }

  observabilityInitialized = true

  if (process.env.NODE_ENV === 'test') {
    return {
      enabled: false,
    }
  }

  const dsn = getEnv('SENTRY_DSN') || getEnv('SENTRY_BACKEND_DSN')

  if (!dsn) {
    return {
      enabled: false,
    }
  }

  Sentry.init({
    dsn,
    environment: getEnv('SENTRY_ENVIRONMENT') || process.env.NODE_ENV || 'development',
    release: getEnv('RENDER_GIT_COMMIT') || getEnv('VERCEL_GIT_COMMIT_SHA') || undefined,
    sendDefaultPii: false,
    tracesSampleRate: 0,
    beforeSend(event, hint) {
      const sanitizedEvent = {
        ...event,
        message: sanitizeString(event.message || ''),
        request: event.request ? sanitizeRequestData(event.request) : undefined,
        extra: sanitizeValue(event.extra),
        contexts: sanitizeValue(event.contexts),
      }

      if (Array.isArray(sanitizedEvent.exception?.values)) {
        sanitizedEvent.exception.values = sanitizedEvent.exception.values.map((value) => ({
          ...value,
          value: sanitizeString(value?.value || ''),
        }))
      }

      const originalError = hint?.originalException
      const reportContext = sanitizeValue(event.extra?.reportContext)

      if (reportContext?.noise === 'low') {
        return null
      }

      if (
        originalError instanceof Error &&
        sanitizeString(originalError.message || '').toLowerCase().includes('aborted')
      ) {
        return null
      }

      return sanitizedEvent
    },
  })

  sentryEnabled = true

  return {
    enabled: true,
  }
}

export function reportBackendError(error, context = {}) {
  const sanitizedContext = sanitizeValue(context)
  const summary = createErrorSummary(error)

  console.error('[observability]', JSON.stringify({
    context: sanitizedContext,
    error: summary,
    timestamp: new Date().toISOString(),
  }))

  if (!sentryEnabled || sanitizedContext?.noise === 'low') {
    return
  }

  Sentry.withScope((scope) => {
    scope.setLevel('error')
    scope.setTag('source', sanitizedContext?.source || 'backend')

    if (sanitizedContext?.route) {
      scope.setTag('route', sanitizedContext.route)
    }

    if (sanitizedContext?.label) {
      scope.setTag('label', sanitizedContext.label)
    }

    scope.setContext(
      'reportContext',
      typeof sanitizedContext === 'object' && sanitizedContext !== null
        ? sanitizedContext
        : { value: sanitizedContext },
    )

    Sentry.captureException(error instanceof Error ? error : new Error(summary.message))
  })
}

export function registerProcessErrorHandlers() {
  if (processHandlersRegistered) {
    return
  }

  processHandlersRegistered = true

  process.on('unhandledRejection', (reason) => {
    reportBackendError(reason instanceof Error ? reason : new Error(String(reason)), {
      kind: 'unhandled_rejection',
      source: 'process',
    })
  })

  process.on('uncaughtException', (error) => {
    reportBackendError(error, {
      kind: 'uncaught_exception',
      source: 'process',
    })
  })
}
