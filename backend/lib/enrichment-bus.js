import { EventEmitter } from 'node:events'

export const enrichmentBus = new EventEmitter()

export function emitEnrichmentReady(token, entries, model) {
  enrichmentBus.emit(`enrichment:${token}`, {
    entries,
    model,
  })
}

export function emitPriceComparisonReady(token, results) {
  enrichmentBus.emit(`price_comparison:${token}`, {
    results: Array.isArray(results) ? results : [],
  })
}
