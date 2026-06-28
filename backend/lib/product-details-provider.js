import { fetchRainforestProductDetailsByAsin } from './rainforest-pipeline.js'

export async function fetchAmazonProductDetailsByAsin({
  asins = [],
  rainforestApiKey,
  amazonDomain = 'amazon.com',
  readCache = async () => new Map(),
  writeCache = async () => {},
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

  return detailsById
}
