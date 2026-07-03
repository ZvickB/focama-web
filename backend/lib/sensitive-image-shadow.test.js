import { describe, expect, it } from 'vitest'

import {
  isAllowedSensitiveImageUrl,
  isSensitiveImageShadowEnabled,
} from './sensitive-image-shadow.js'

describe('sensitive image shadow evaluation', () => {
  it('is disabled unless explicitly enabled', () => {
    expect(isSensitiveImageShadowEnabled({})).toBe(false)
    expect(isSensitiveImageShadowEnabled({ SENSITIVE_IMAGE_SHADOW_ENABLED: 'true' })).toBe(true)
  })

  it('allows known Amazon image hosts over HTTPS', () => {
    expect(isAllowedSensitiveImageUrl('https://m.media-amazon.com/images/I/example.jpg')).toBe(true)
    expect(isAllowedSensitiveImageUrl('http://m.media-amazon.com/images/I/example.jpg')).toBe(false)
  })

  it('rejects unknown hosts unless explicitly configured', () => {
    const imageUrl = 'https://images.example.test/product.jpg'
    expect(isAllowedSensitiveImageUrl(imageUrl)).toBe(false)
    expect(isAllowedSensitiveImageUrl(imageUrl, {
      SENSITIVE_IMAGE_SHADOW_ALLOWED_HOSTS: 'images.example.test',
    })).toBe(true)
  })
})
