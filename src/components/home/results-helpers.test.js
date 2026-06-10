import { describe, expect, it, vi } from 'vitest'

// Import from the current location — tests stay valid after the move.
import {
  getRatingValue,
  formatReviewCount,
  formatRatingsReviewsText,
  getFeatureBullets,
  hasPendingReason,
  getShortReason,
  handleRetryFeedbackKeyDown,
} from './results-helpers.js'

describe('getRatingValue', () => {
  it('returns a number for a valid numeric string', () => {
    expect(getRatingValue('4.5')).toBe(4.5)
  })

  it('returns a number for a number input', () => {
    expect(getRatingValue(3)).toBe(3)
  })

  it('returns null for null, undefined, empty string, and boolean', () => {
    expect(getRatingValue(null)).toBeNull()
    expect(getRatingValue(undefined)).toBeNull()
    expect(getRatingValue('')).toBeNull()
    expect(getRatingValue(true)).toBeNull()
  })

  it('returns null for non-numeric strings', () => {
    expect(getRatingValue('abc')).toBeNull()
  })
})

describe('formatReviewCount', () => {
  it('formats a positive review count', () => {
    expect(formatReviewCount(1500)).toBe('1,500 reviews')
  })

  it('returns empty string for zero or negative', () => {
    expect(formatReviewCount(0)).toBe('')
    expect(formatReviewCount(-1)).toBe('')
  })

  it('returns empty string for non-numeric input', () => {
    expect(formatReviewCount('abc')).toBe('')
  })
})

describe('formatRatingsReviewsText', () => {
  it('combines rating and review count', () => {
    expect(formatRatingsReviewsText({ rating: 4.4, reviewCount: 87 })).toBe('4.4 stars · 87 reviews')
  })

  it('returns rating only when no reviews', () => {
    expect(formatRatingsReviewsText({ rating: 3.0, reviewCount: 0 })).toBe('3.0 stars')
  })

  it('returns "No rating" when both are absent', () => {
    expect(formatRatingsReviewsText({})).toBe('No rating')
  })
})

describe('getFeatureBullets', () => {
  it('returns trimmed, non-empty bullets', () => {
    expect(getFeatureBullets({ feature_bullets: ['  a  ', '', 'b'] })).toEqual(['a', 'b'])
  })

  it('returns empty array when missing', () => {
    expect(getFeatureBullets({})).toEqual([])
    expect(getFeatureBullets(null)).toEqual([])
  })
})

describe('hasPendingReason', () => {
  it('returns true when final results exist, enrichment not settled, and no content', () => {
    expect(
      hasPendingReason({
        hasFinalResults: true,
        isEnrichmentSettled: false,
        item: { fit_reason: '', caveat: '', reasons: [], description: '', feature_bullets: [] },
      }),
    ).toBe(true)
  })

  it('returns false when enrichment is settled', () => {
    expect(
      hasPendingReason({
        hasFinalResults: true,
        isEnrichmentSettled: true,
        item: { fit_reason: '', caveat: '', reasons: [], description: '', feature_bullets: [] },
      }),
    ).toBe(false)
  })
})

describe('getShortReason', () => {
  it('returns fit_reason when present', () => {
    expect(getShortReason({ fit_reason: 'Good fit' }, { hasFinalResults: true })).toBe('Good fit')
  })

  it('returns fallback message for final results with no content', () => {
    const item = { fit_reason: '', caveat: '', reasons: [], description: '', feature_bullets: [] }
    expect(getShortReason(item, { hasFinalResults: true })).toBe(
      'Open details for product facts and retailer info.',
    )
  })

  it('returns empty string for non-final results with no content', () => {
    const item = { fit_reason: '', caveat: '', reasons: [], description: '', feature_bullets: [] }
    expect(getShortReason(item, { hasFinalResults: false })).toBe('')
  })
})

describe('handleRetryFeedbackKeyDown', () => {
  it('calls onSubmit on Enter when canSubmit is true', () => {
    const onSubmit = vi.fn()
    const event = { key: 'Enter', shiftKey: false, nativeEvent: {}, preventDefault: vi.fn() }
    handleRetryFeedbackKeyDown(event, { canSubmit: true, onSubmit })
    expect(event.preventDefault).toHaveBeenCalled()
    expect(onSubmit).toHaveBeenCalled()
  })

  it('does nothing on Shift+Enter', () => {
    const onSubmit = vi.fn()
    const event = { key: 'Enter', shiftKey: true, nativeEvent: {}, preventDefault: vi.fn() }
    handleRetryFeedbackKeyDown(event, { canSubmit: true, onSubmit })
    expect(onSubmit).not.toHaveBeenCalled()
  })

  it('does not call onSubmit when canSubmit is false', () => {
    const onSubmit = vi.fn()
    const event = { key: 'Enter', shiftKey: false, nativeEvent: {}, preventDefault: vi.fn() }
    handleRetryFeedbackKeyDown(event, { canSubmit: false, onSubmit })
    expect(event.preventDefault).toHaveBeenCalled()
    expect(onSubmit).not.toHaveBeenCalled()
  })
})
