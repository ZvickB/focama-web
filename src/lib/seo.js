const DEFAULT_SITE_URL = 'https://focamai.com'
const DEFAULT_TITLE = 'Focamai | Calm product search before the marketplace'
const DEFAULT_DESCRIPTION =
  'Focamai helps shoppers describe what they need and get a short, calm set of product picks before heading to a marketplace.'
const DEFAULT_IMAGE_PATH = '/icon-512.png'
const SITE_NAME = 'Focamai'

function trimTrailingSlash(value) {
  return value.replace(/\/+$/, '')
}

export function getSiteUrl() {
  const configuredSiteUrl = import.meta.env.VITE_SITE_URL?.trim()
  return trimTrailingSlash(configuredSiteUrl || DEFAULT_SITE_URL)
}

export function buildAbsoluteUrl(path = '/') {
  const normalizedPath = path.startsWith('/') ? path : `/${path}`
  return `${getSiteUrl()}${normalizedPath === '/' ? '/' : normalizedPath}`
}

export function buildSeoTitle(title) {
  if (!title) return DEFAULT_TITLE
  return title.includes(SITE_NAME) ? title : `${title} | ${SITE_NAME}`
}

export function getDefaultSeo() {
  return {
    title: DEFAULT_TITLE,
    description: DEFAULT_DESCRIPTION,
    image: buildAbsoluteUrl(DEFAULT_IMAGE_PATH),
    siteName: SITE_NAME,
    type: 'website',
  }
}
