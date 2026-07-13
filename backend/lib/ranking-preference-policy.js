import { RANKING_PREFERENCES, normalizeRankingPreference } from '../../shared/ranking-preference.js'

const RECOGNIZED_BRANDS_BY_CATEGORY = {
  air_purifier: ['blueair', 'coway', 'dyson', 'honeywell', 'levoit', 'winix'],
  coffee_grinder: ['baratza', 'breville', 'capresso', 'cuisinart', 'fellow', 'kitchenaid', 'oxo'],
  cordless_drill: ['black+decker', 'bosch', 'craftsman', 'dewalt', 'makita', 'milwaukee', 'ryobi'],
  dash_cam: ['70mai', 'garmin', 'nextbase', 'redtiger', 'rove', 'vantrue', 'viofo'],
  headphones: ['anker', 'bose', 'jabra', 'jlab', 'logitech', 'sony', 'soundcore'],
  knife_set: ['cuisinart', 'henckels', 'victorinox', 'wusthof', 'zwilling'],
  robot_vacuum: ['eufy', 'irobot', 'roborock', 'shark'],
  stroller: ['baby jogger', 'chicco', 'gb', 'graco', 'uppababy'],
  usb_c_charger: ['anker', 'baseus', 'belkin', 'ugreen'],
}

function categoryForQuery(query) {
  const value = String(query || '').toLowerCase()
  if (/air purifier/.test(value)) return 'air_purifier'
  if (/coffee grinder/.test(value)) return 'coffee_grinder'
  if (/cordless drill/.test(value)) return 'cordless_drill'
  if (/dash cam/.test(value)) return 'dash_cam'
  if (/headphones?/.test(value)) return 'headphones'
  if (/knife set/.test(value)) return 'knife_set'
  if (/robot vacuum/.test(value)) return 'robot_vacuum'
  if (/stroller/.test(value)) return 'stroller'
  if (/usb[ -]?c charger/.test(value)) return 'usb_c_charger'
  return ''
}

function getPriceBand(candidate, low, high) {
  const price = Number(candidate?.numericPrice)
  if (!Number.isFinite(price) || low === high) return 'mid'
  const third = (high - low) / 3
  if (price <= low + third) return 'budget'
  if (price >= high - third) return 'premium'
  return 'mid'
}

function getRecognizedBrand(candidate, category) {
  const brands = RECOGNIZED_BRANDS_BY_CATEGORY[category] || []
  const text = `${candidate?.brandName || ''} ${candidate?.title || ''}`.toLowerCase()
  return brands.some((brand) => text.includes(brand))
}

function uniqueByFamily(candidates) {
  const seen = new Set()
  return candidates.filter((candidate) => {
    const key = candidate.duplicateFamilyKey || candidate.id
    if (seen.has(key)) return false
    seen.add(key)
    return true
  })
}

function fill(selected, candidates, limit) {
  const selectedIds = new Set(selected.map((candidate) => String(candidate.id)))
  for (const candidate of candidates) {
    if (selected.length >= limit) break
    if (!selectedIds.has(String(candidate.id))) {
      selected.push(candidate)
      selectedIds.add(String(candidate.id))
    }
  }
  return selected
}

export function composePreferenceShortlist({ candidatePool, fitFrontierIds, finalResultLimit, rankingPreference }) {
  const preference = normalizeRankingPreference(rankingPreference)
  const candidateById = new Map((candidatePool?.candidates || []).map((candidate) => [String(candidate.id), candidate]))
  const frontier = uniqueByFamily((fitFrontierIds || []).map((id) => candidateById.get(String(id))).filter(Boolean))
  const limit = Math.min(finalResultLimit, frontier.length)

  if (preference === RANKING_PREFERENCES.BALANCED || limit === 0) {
    return { ids: frontier.slice(0, limit).map((candidate) => String(candidate.id)), policy: 'balanced' }
  }

  const prices = frontier.map((candidate) => Number(candidate.numericPrice)).filter(Number.isFinite)
  const low = prices.length ? Math.min(...prices) : 0
  const high = prices.length ? Math.max(...prices) : 0
  const annotated = frontier.map((candidate) => ({
    ...candidate,
    priceBand: getPriceBand(candidate, low, high),
    recognizedBrand: getRecognizedBrand(candidate, categoryForQuery(candidatePool?.query)),
  }))
  const hero = annotated[0]
  let selected
  let policy = preference

  if (preference === RANKING_PREFERENCES.PRICE) {
    selected = [hero]
    fill(selected, [...annotated.slice(1)].sort((a, b) => Number(a.numericPrice) - Number(b.numericPrice)), limit)
  } else if (preference === RANKING_PREFERENCES.LOWEST_PRICE) {
    selected = [...annotated].sort((a, b) => Number(a.numericPrice) - Number(b.numericPrice)).slice(0, limit)
  } else if (preference === RANKING_PREFERENCES.BRAND) {
    const known = annotated.filter((candidate) => candidate.recognizedBrand)
    if (known.length === 0) {
      selected = annotated.slice(0, limit)
      policy = 'brand_fallback_no_recognized_brand'
    } else {
      selected = []
      fill(selected, known, limit)
      fill(selected, annotated, limit)
    }
  } else {
    selected = [hero]
    const remaining = annotated.slice(1)
    const seenBands = new Set([hero.priceBand])
    const seenFamilies = new Set([hero.duplicateFamilyKey || hero.id])
    while (selected.length < limit && remaining.length) {
      let nextIndex = remaining.findIndex((candidate) =>
        !seenBands.has(candidate.priceBand) && !seenFamilies.has(candidate.duplicateFamilyKey || candidate.id),
      )
      if (nextIndex < 0) {
        const heroPrice = Number(hero.numericPrice)
        nextIndex = remaining.reduce((bestIndex, candidate, index) => {
          const candidateDistance = Math.abs(Number(candidate.numericPrice) - heroPrice)
          const bestDistance = Math.abs(Number(remaining[bestIndex].numericPrice) - heroPrice)
          return candidateDistance > bestDistance ? index : bestIndex
        }, 0)
      }
      const next = remaining.splice(nextIndex >= 0 ? nextIndex : 0, 1)[0]
      selected.push(next)
      seenBands.add(next.priceBand)
      seenFamilies.add(next.duplicateFamilyKey || next.id)
    }
  }

  return {
    ids: selected.slice(0, limit).map((candidate) => String(candidate.id)),
    policy,
    recognizedBrandCount: annotated.filter((candidate) => candidate.recognizedBrand).length,
  }
}
