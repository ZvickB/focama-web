import { fetchOxylabsProductDetailsByAsin } from './oxylabs-pipeline.js'
import { fetchRainforestProductDetailsByAsin } from './rainforest-pipeline.js'

export async function fetchAmazonProductDetailsByAsin({
  asins = [],
  rainforestApiKey,
  oxylabsUsername,
  oxylabsPassword,
  amazonDomain = 'amazon.com',
  readCache = async () => new Map(),
  writeCache = async () => {},
  onOxylabsAsinFailure = () => {},
  onOxylabsBackgroundRetryResolved = async () => {},
} = {}) {
  const detailsById = new Map()

  if (rainforestApiKey) {
    const rainforestDetails = await fetchRainforestProductDetailsByAsin({
      asins,
      rainforestApiKey,
      amazonDomain,
      readCache,
      writeCache,
    })

    for (const [asin, details] of rainforestDetails.entries()) {
      detailsById.set(asin, details)
    }
  }

  const missingAsins = asins.filter((asin) => !detailsById.has(asin))

  if (missingAsins.length === 0 || !oxylabsUsername || !oxylabsPassword) {
    return detailsById
  }

  const oxylabsDetails = await fetchOxylabsProductDetailsByAsin({
    asins: missingAsins,
    oxylabsUsername,
    oxylabsPassword,
    amazonDomain,
    readCache,
    writeCache,
    onAsinFailure: onOxylabsAsinFailure,
    onBackgroundRetryResolved: onOxylabsBackgroundRetryResolved,
  })

  for (const [asin, details] of oxylabsDetails.entries()) {
    detailsById.set(asin, details)
  }

  return detailsById
}
