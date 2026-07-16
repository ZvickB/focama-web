import { EventEmitter } from 'node:events'

export const enrichmentBus = new EventEmitter()

export function emitEnrichmentReady(
  token,
  entries,
  model,
  deepDiveEligibility = null,
  improvePicksSuggestions = [],
) {
  enrichmentBus.emit(`enrichment:${token}`, {
    deepDiveEligibility,
    entries,
    improvePicksSuggestions,
    model,
  })
}
