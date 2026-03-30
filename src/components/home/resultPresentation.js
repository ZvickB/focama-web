const PRIMARY_BADGE = 'Best match'
const MAX_BADGED_RESULTS = 3

const KEYWORD_BADGE_RULES = [
  {
    label: 'Best lightweight option',
    strongPatterns: [
      /\blightweight\b/i,
      /\bultralight\b/i,
      /\bultra[-\s]?light\b/i,
      /\bcarry[-\s]?on\b/i,
      /\bportable\b/i,
      /\beasy to carry\b/i,
    ],
    softPatterns: [/\btravel\b/i, /\bcompact\b/i],
    minimumScore: 2,
  },
  {
    label: 'Best for small spaces',
    strongPatterns: [
      /\bsmall spaces?\b/i,
      /\bsmall-space\b/i,
      /\bapartment\b/i,
      /\bnarrow footprint\b/i,
      /\bspace-saving\b/i,
    ],
    softPatterns: [/\bcompact\b/i, /\bslim\b/i, /\bcity\b/i],
    minimumScore: 2,
  },
  {
    label: 'Best for beginners',
    strongPatterns: [/\bbeginner\b/i, /\bstarter\b/i, /\bfirst[-\s]?time\b/i],
    softPatterns: [/\beasy to use\b/i, /\beasy setup\b/i, /\bsimple\b/i],
    minimumScore: 2,
  },
  {
    label: 'Best for comfort',
    strongPatterns: [
      /\bcomfort\b/i,
      /\bcomfortable\b/i,
      /\bergonomic\b/i,
      /\bplush\b/i,
      /\bcushion(?:ed)?\b/i,
      /\bpadded\b/i,
      /\bsupportive\b/i,
    ],
    softPatterns: [],
    minimumScore: 2,
  },
  {
    label: 'Best for durability',
    strongPatterns: [
      /\bdurable\b/i,
      /\bdurability\b/i,
      /\bsturdy\b/i,
      /\bheavy[-\s]?duty\b/i,
      /\bsolid build\b/i,
      /\blong[-\s]?lasting\b/i,
      /\bsteel frame\b/i,
    ],
    softPatterns: [],
    minimumScore: 2,
  },
]

function parsePrice(value) {
  const normalized = String(value || '').replace(/,/g, '')
  const match = normalized.match(/(\d+(?:\.\d+)?)/)

  if (!match) {
    return null
  }

  const numericValue = Number(match[1])
  return Number.isFinite(numericValue) ? numericValue : null
}

function getPresentationText(item) {
  return [item?.title, item?.description, ...(Array.isArray(item?.reasons) ? item.reasons : [])]
    .filter(Boolean)
    .join(' ')
}

function scoreKeywordBadge(item, rule) {
  const text = getPresentationText(item)

  if (!text) {
    return null
  }

  const strongMatchCount = rule.strongPatterns.filter((pattern) => pattern.test(text)).length
  const softMatchCount = rule.softPatterns.filter((pattern) => pattern.test(text)).length
  const score = strongMatchCount * 2 + softMatchCount

  if (score < rule.minimumScore) {
    return null
  }

  return score + 2
}

function getNumericPrices(results) {
  return results
    .map((item, index) => ({
      index,
      price: parsePrice(item?.price),
      rating: Number(item?.rating),
      reviewCount: Number(item?.reviewCount),
    }))
    .filter((entry) => Number.isFinite(entry.price))
    .sort((left, right) => left.price - right.price)
}

function getMedianPrice(pricedEntries) {
  if (pricedEntries.length === 0) {
    return null
  }

  const middleIndex = Math.floor(pricedEntries.length / 2)

  if (pricedEntries.length % 2 === 1) {
    return pricedEntries[middleIndex].price
  }

  return (pricedEntries[middleIndex - 1].price + pricedEntries[middleIndex].price) / 2
}

function buildDeterministicBadgeProposals(results) {
  const proposals = []

  results.forEach((item, index) => {
    KEYWORD_BADGE_RULES.forEach((rule) => {
      const score = scoreKeywordBadge(item, rule)

      if (!score) {
        return
      }

      proposals.push({
        index,
        label: rule.label,
        score,
      })
    })
  })

  const pricedEntries = getNumericPrices(results)

  if (pricedEntries.length >= 2) {
    const cheapest = pricedEntries[0]
    const secondCheapest = pricedEntries[1]
    const priciest = pricedEntries[pricedEntries.length - 1]
    const secondPriciest = pricedEntries[pricedEntries.length - 2]
    const medianPrice = getMedianPrice(pricedEntries)

    if (
      Number.isFinite(cheapest.price) &&
      Number.isFinite(secondCheapest.price) &&
      secondCheapest.price >= cheapest.price * 1.12
    ) {
      proposals.push({
        index: cheapest.index,
        label: 'Best budget pick',
        score: 4,
      })
    }

    if (
      Number.isFinite(priciest.price) &&
      Number.isFinite(secondPriciest.price) &&
      priciest.price >= secondPriciest.price * 1.12 &&
      Number.isFinite(priciest.rating) &&
      priciest.rating >= 4
    ) {
      proposals.push({
        index: priciest.index,
        label: 'Best premium pick',
        score: 4,
      })
    }

    if (Number.isFinite(medianPrice)) {
      const valueCandidate = pricedEntries
        .filter(
          (entry) =>
            Number.isFinite(entry.rating) &&
            Number.isFinite(entry.reviewCount) &&
            entry.rating >= 4.2 &&
            entry.reviewCount >= 50 &&
            entry.price <= medianPrice * 1.05,
        )
        .sort((left, right) => {
          const leftScore = left.rating * 20 + Math.min(left.reviewCount, 1000) / 100 - left.price / medianPrice
          const rightScore =
            right.rating * 20 + Math.min(right.reviewCount, 1000) / 100 - right.price / medianPrice

          return rightScore - leftScore
        })[0]

      if (valueCandidate) {
        proposals.push({
          index: valueCandidate.index,
          label: 'Best value',
          score: 3,
        })
      }
    }
  }

  return proposals.sort((left, right) => {
    if (left.score !== right.score) {
      return right.score - left.score
    }

    return left.index - right.index
  })
}

export function enrichFinalResultsForDisplay(results) {
  if (!Array.isArray(results) || results.length === 0) {
    return Array.isArray(results) ? results : []
  }

  const nextResults = results.map((item) => ({ ...item }))
  const usedLabels = new Set()
  const assignedIndexes = new Set()

  nextResults.forEach((item, index) => {
    const label = typeof item?.badgeLabel === 'string' ? item.badgeLabel.trim() : ''

    if (!label) {
      return
    }

    if (!usedLabels.has(label)) {
      usedLabels.add(label)
      assignedIndexes.add(index)
      return
    }

    nextResults[index].badgeLabel = ''
  })

  if (!usedLabels.has(PRIMARY_BADGE) && nextResults[0]) {
    nextResults[0].badgeLabel = PRIMARY_BADGE
    usedLabels.add(PRIMARY_BADGE)
    assignedIndexes.add(0)
  }

  const proposals = buildDeterministicBadgeProposals(nextResults)

  for (const proposal of proposals) {
    if (usedLabels.size >= MAX_BADGED_RESULTS) {
      break
    }

    if (usedLabels.has(proposal.label) || assignedIndexes.has(proposal.index)) {
      continue
    }

    nextResults[proposal.index].badgeLabel = proposal.label
    usedLabels.add(proposal.label)
    assignedIndexes.add(proposal.index)
  }

  return nextResults
}
