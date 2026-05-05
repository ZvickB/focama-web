import { useEffect } from 'react'
import { buildAbsoluteUrl, buildSeoTitle, getDefaultSeo } from '@/lib/seo.js'

const SEO_MANAGED_ATTRIBUTE = 'data-seo-managed'
const STRUCTURED_DATA_ELEMENT_ID = 'seo-structured-data'

function upsertMeta(selector, attributes) {
  let element = document.head.querySelector(selector)

  if (!element) {
    element = document.createElement('meta')
    document.head.appendChild(element)
  }

  Object.entries(attributes).forEach(([key, value]) => {
    element.setAttribute(key, value)
  })

  element.setAttribute(SEO_MANAGED_ATTRIBUTE, 'true')
}

function upsertLink(selector, attributes) {
  let element = document.head.querySelector(selector)

  if (!element) {
    element = document.createElement('link')
    document.head.appendChild(element)
  }

  Object.entries(attributes).forEach(([key, value]) => {
    element.setAttribute(key, value)
  })

  element.setAttribute(SEO_MANAGED_ATTRIBUTE, 'true')
}

function writeStructuredData(jsonLd) {
  const existingElement = document.getElementById(STRUCTURED_DATA_ELEMENT_ID)

  if (!jsonLd?.length) {
    existingElement?.remove()
    return
  }

  const scriptElement = existingElement || document.createElement('script')
  scriptElement.id = STRUCTURED_DATA_ELEMENT_ID
  scriptElement.type = 'application/ld+json'
  scriptElement.textContent = JSON.stringify(jsonLd)

  if (!existingElement) {
    document.head.appendChild(scriptElement)
  }
}

function Seo({
  title,
  description,
  path = '/',
  imagePath = '/icon-512.png',
  type = 'website',
  noindex = false,
  jsonLd = null,
}) {
  useEffect(() => {
    const defaults = getDefaultSeo()
    const resolvedTitle = buildSeoTitle(title)
    const resolvedDescription = description || defaults.description
    const resolvedUrl = buildAbsoluteUrl(path)
    const resolvedImage = buildAbsoluteUrl(imagePath)
    const robotsContent = noindex ? 'noindex, nofollow' : 'index, follow'

    document.title = resolvedTitle

    upsertMeta('meta[name="description"]', {
      name: 'description',
      content: resolvedDescription,
    })
    upsertMeta('meta[name="robots"]', {
      name: 'robots',
      content: robotsContent,
    })
    upsertMeta('meta[property="og:title"]', {
      property: 'og:title',
      content: resolvedTitle,
    })
    upsertMeta('meta[property="og:description"]', {
      property: 'og:description',
      content: resolvedDescription,
    })
    upsertMeta('meta[property="og:type"]', {
      property: 'og:type',
      content: type,
    })
    upsertMeta('meta[property="og:url"]', {
      property: 'og:url',
      content: resolvedUrl,
    })
    upsertMeta('meta[property="og:site_name"]', {
      property: 'og:site_name',
      content: defaults.siteName,
    })
    upsertMeta('meta[property="og:image"]', {
      property: 'og:image',
      content: resolvedImage,
    })
    upsertMeta('meta[property="og:image:alt"]', {
      property: 'og:image:alt',
      content: resolvedTitle,
    })
    upsertMeta('meta[name="twitter:card"]', {
      name: 'twitter:card',
      content: 'summary_large_image',
    })
    upsertMeta('meta[name="twitter:title"]', {
      name: 'twitter:title',
      content: resolvedTitle,
    })
    upsertMeta('meta[name="twitter:description"]', {
      name: 'twitter:description',
      content: resolvedDescription,
    })
    upsertMeta('meta[name="twitter:image"]', {
      name: 'twitter:image',
      content: resolvedImage,
    })
    upsertLink('link[rel="canonical"]', {
      rel: 'canonical',
      href: resolvedUrl,
    })

    writeStructuredData(jsonLd)
  }, [description, imagePath, jsonLd, noindex, path, title, type])

  return null
}

export default Seo
