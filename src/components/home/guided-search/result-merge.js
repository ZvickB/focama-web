export function mergeEnrichmentIntoResults(results, enrichmentEntries) {
  if (!Array.isArray(results) || !Array.isArray(enrichmentEntries) || enrichmentEntries.length === 0) {
    return results
  }

  const enrichmentById = new Map(
    enrichmentEntries.map((entry) => [
      String(entry?.candidate_id || entry?.candidateId || ''),
      entry,
    ]),
  )

  return results.map((result) => {
    const entry = enrichmentById.get(String(result.id))

    if (!entry) {
      return result
    }

    return {
      ...result,
      sourceTitle: entry?.source_title || entry?.sourceTitle || result.sourceTitle || result.title || '',
      displayTitle: entry?.display_title || entry?.displayTitle || result.displayTitle || '',
      matchIdentifier: entry?.match_identifier || entry?.matchIdentifier || result.matchIdentifier || null,
      fit_reason: entry?.fit_reason || entry?.fitReason || '',
      caveat: entry?.caveat || '',
      isPrime: Boolean(result.isPrime || entry?.isPrime || entry?.is_prime),
      delivery: entry?.delivery || result.delivery || '',
      productDescription: entry?.productDescription || entry?.product_description || result.productDescription || '',
      feature_bullets: Array.isArray(entry?.feature_bullets)
        ? entry.feature_bullets
        : Array.isArray(entry?.featureBullets)
          ? entry.featureBullets
          : Array.isArray(result?.feature_bullets)
            ? result.feature_bullets
            : [],
    }
  })
}

export function mergeProductDetailsIntoResults(results, productId, details) {
  if (!Array.isArray(results) || !productId || !details?.ready) {
    return results
  }

  return results.map((result) => {
    if (String(result.id) !== String(productId)) {
      return result
    }

    const featureBullets = Array.isArray(details.feature_bullets)
      ? details.feature_bullets
      : Array.isArray(details.featureBullets)
        ? details.featureBullets
        : []

    return {
      ...result,
      isPrime: Boolean(result.isPrime || details.isPrime || details.is_prime),
      delivery: details.delivery || result.delivery || '',
      productDescription: details.productDescription || details.product_description || result.productDescription || '',
      feature_bullets: featureBullets.length > 0
        ? featureBullets
        : Array.isArray(result.feature_bullets)
          ? result.feature_bullets
          : [],
    }
  })
}

export function entriesNeedFeatureBulletHydration(enrichmentEntries) {
  if (!Array.isArray(enrichmentEntries) || enrichmentEntries.length === 0) {
    return false
  }

  return enrichmentEntries.some((entry) => {
    const featureBullets = Array.isArray(entry?.feature_bullets)
      ? entry.feature_bullets
      : Array.isArray(entry?.featureBullets)
        ? entry.featureBullets
        : []

    return featureBullets.length === 0
  })
}

export function mergeFinalizeResults(results, sourceCandidatePool) {
  if (!Array.isArray(results) || !sourceCandidatePool?.candidates) {
    return Array.isArray(results) ? results : []
  }

  const candidateById = new Map(
    sourceCandidatePool.candidates.map((candidate) => [String(candidate.id), candidate]),
  )

  return results.map((result) => {
    const sourceCandidate = candidateById.get(String(result.id))

    if (!sourceCandidate) {
      return result
    }

    return {
      ...result,
      image: sourceCandidate.image || result.image,
      link: sourceCandidate.link || result.link,
      isPrime: Boolean(result.isPrime || sourceCandidate.isPrime),
      productDescription: sourceCandidate.productDescription || result.productDescription || '',
    }
  })
}

export function findResultById(results, id) {
  if (!Array.isArray(results) || !id) {
    return null
  }

  return results.find((item) => String(item.id) === String(id)) || null
}

export function resolveSelectedProductForDisplay({
  previousResults = [],
  previewResults = [],
  results = [],
  selectedProduct,
}) {
  if (!selectedProduct) {
    return null
  }

  const selectedProductResultSet = selectedProduct.analyticsMeta?.resultSet || 'final'
  const selectedProductLiveSource =
    selectedProductResultSet === 'previous'
      ? previousResults
      : selectedProductResultSet === 'preview'
        ? previewResults
        : results
  const liveSelectedProduct =
    selectedProduct.id
      ? findResultById(selectedProductLiveSource, selectedProduct.id) ||
        findResultById(results, selectedProduct.id) ||
        findResultById(previousResults, selectedProduct.id) ||
        findResultById(previewResults, selectedProduct.id)
      : null

  if (!liveSelectedProduct) {
    return selectedProduct
  }

  return {
    ...liveSelectedProduct,
    analyticsMeta: selectedProduct.analyticsMeta,
  }
}
