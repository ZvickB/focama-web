import { AMAZON_MARKETPLACE_AUTO } from '@/contexts/amazonStoreConstants.js'

function cleanSourceLabel(value) {
  return typeof value === 'string' ? value.trim().replace(/\s+/g, ' ') : ''
}

function resolveAmazonDomain(selectedAmazonDomain, resolvedAmazonDomain) {
  if (selectedAmazonDomain && selectedAmazonDomain !== AMAZON_MARKETPLACE_AUTO) {
    return selectedAmazonDomain
  }

  if (resolvedAmazonDomain && resolvedAmazonDomain !== AMAZON_MARKETPLACE_AUTO) {
    return resolvedAmazonDomain
  }

  return ''
}

export function getRetailerDisplayName({
  resolvedAmazonDomain = '',
  selectedAmazonDomain = '',
  subtitle = '',
} = {}) {
  const sourceLabel = cleanSourceLabel(subtitle)

  if (!sourceLabel || sourceLabel === 'Marketplace result') {
    return ''
  }

  if (sourceLabel.toLowerCase() !== 'amazon') {
    return sourceLabel
  }

  const amazonDomain = resolveAmazonDomain(selectedAmazonDomain, resolvedAmazonDomain)

  if (amazonDomain && amazonDomain.toLowerCase().startsWith('amazon.')) {
    return amazonDomain.replace(/^amazon\./i, 'Amazon.')
  }

  return 'Amazon'
}
