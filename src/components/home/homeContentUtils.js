export function getUserFacingReasons(reasons = []) {
  return reasons.filter((reason) => {
    const normalizedReason = String(reason || '').trim()

    if (!normalizedReason) {
      return false
    }

    return !(
      /serpapi search route|live product result returned/i.test(normalizedReason) ||
      /^available from\b/i.test(normalizedReason) ||
      /^listed around\b/i.test(normalizedReason) ||
      /^price details were limited\b/i.test(normalizedReason)
    )
  })
}

export function getUserFacingDescription(description) {
  const normalizedDescription = String(description || '').trim()

  if (!normalizedDescription) {
    return ''
  }

  if (/serpapi search route|live product result returned/i.test(normalizedDescription)) {
    return ''
  }

  return normalizedDescription
}
