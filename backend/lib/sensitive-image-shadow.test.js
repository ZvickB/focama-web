import { describe, expect, it } from 'vitest'

import {
  isAllowedSensitiveImageUrl,
  isSensitiveImageShadowEnabled,
} from './sensitive-image-shadow.js'
import {
  analyzeSensitiveImageWithSightengine,
  decideSightengineSensitiveImage,
  getSightengineConfig,
} from './sightengine-sensitive-image.js'

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

describe('Sightengine sensitive image analysis', () => {
  it('uses the configured server-side credentials without exposing their values in results', () => {
    expect(getSightengineConfig({
      SIGHTENGINE_API_USER: 'test-user',
      SIGHTENGINE_API_SECRET: 'test-secret',
    })).toEqual({
      apiUser: 'test-user',
      apiSecret: 'test-secret',
      timeoutMs: 10_000,
    })
  })

  it('only proposes show when person and face checks are confidently clear', () => {
    expect(decideSightengineSensitiveImage({
      people_count: { 0: 0.98, 1: 0.02 },
      faces: [],
      artificial_faces: [],
    })).toMatchObject({
      proposedOutcome: 'show',
      reasons: ['no_person_or_face_detected'],
    })

    expect(decideSightengineSensitiveImage({
      people_count: { 0: 0.1, 1: 0.9 },
      faces: [],
      artificial_faces: [],
    })).toMatchObject({
      proposedOutcome: 'hide',
      reasons: ['person_present_or_uncertain'],
    })

    expect(decideSightengineSensitiveImage({
      people_count: { 0: 0.99, 1: 0.01 },
      faces: [],
      artificial_faces: [{ x1: 0.1, y1: 0.1, x2: 0.3, y2: 0.3 }],
    })).toMatchObject({
      proposedOutcome: 'hide',
      reasons: ['artificial_face_detected'],
      signals: {
        artificialFaceCount: 1,
      },
    })
  })

  it('calls both Sightengine models and returns a conservative normalized result', async () => {
    const fetchImpl = async (requestUrl) => {
      expect(requestUrl.searchParams.get('models')).toBe('people-counting,face-analysis')
      expect(requestUrl.searchParams.get('api_user')).toBe('test-user')
      expect(requestUrl.searchParams.get('api_secret')).toBe('test-secret')
      return {
        ok: true,
        json: async () => ({
          status: 'success',
          request: { id: 'request-1', operations: 2 },
          'people-counting': { 0: 0.99, 1: 0.01 },
          faces: [],
          artificial_faces: [],
        }),
      }
    }

    await expect(analyzeSensitiveImageWithSightengine('https://m.media-amazon.com/image.jpg', {
      env: {
        SIGHTENGINE_API_USER: 'test-user',
        SIGHTENGINE_API_SECRET: 'test-secret',
      },
      fetchImpl,
    })).resolves.toMatchObject({
      provider: 'sightengine',
      providerRequestId: 'request-1',
      operations: 2,
      proposedOutcome: 'show',
    })
  })

  it('fails closed when credentials are missing or Sightengine returns invalid data', async () => {
    await expect(analyzeSensitiveImageWithSightengine('https://m.media-amazon.com/image.jpg', {
      env: {},
    })).rejects.toThrow('sightengine_credentials_missing')

    await expect(analyzeSensitiveImageWithSightengine('https://m.media-amazon.com/image.jpg', {
      env: {
        SIGHTENGINE_API_USER: 'test-user',
        SIGHTENGINE_API_SECRET: 'test-secret',
      },
      fetchImpl: async () => ({ ok: true, json: async () => ({ status: 'success' }) }),
    })).rejects.toThrow('sightengine_invalid_response')
  })
})
