import { describe, expect, it, vi } from 'vitest'

import {
  shouldShowCharCounter,
  formatTimingValue,
  buildRefinementCopy,
  clampFollowUpNotes,
  addChipToNotes,
  normalizeRefinementChips,
  handleRefinementTextareaKeyDown,
  handleProductQueryTextareaKeyDown,
  handleNewSearchClick,
} from './home-helpers.js'

describe('shouldShowCharCounter', () => {
  it('returns true when remaining characters <= 20', () => {
    expect(shouldShowCharCounter(85, 100)).toBe(true)
  })

  it('returns false when remaining characters > 20', () => {
    expect(shouldShowCharCounter(10, 100)).toBe(false)
  })

  it('returns false when current is 0', () => {
    expect(shouldShowCharCounter(0, 100)).toBe(false)
  })
})

describe('formatTimingValue', () => {
  it('formats a finite number with one decimal', () => {
    expect(formatTimingValue(123.456)).toBe('123.5 ms')
  })

  it('returns n/a for non-finite values', () => {
    expect(formatTimingValue(undefined)).toBe('n/a')
    expect(formatTimingValue(null)).toBe('n/a')
    expect(formatTimingValue(NaN)).toBe('n/a')
  })
})

describe('buildRefinementCopy', () => {
  it('uses prompt values when available', () => {
    const result = buildRefinementCopy({
      isGeneratingPrompt: false,
      prompt: {
        prompt: 'What size do you need?',
        helperText: 'Pick a size',
        followUpPlaceholder: 'e.g. medium',
      },
      submittedQuery: 'shirt',
    })

    expect(result.titleQuestion).toBe('What size do you need?')
    expect(result.helper).toBe('Pick a size')
    expect(result.placeholder).toBe('e.g. medium')
    expect(result.titleEyebrow).toBe('Focamai asks:')
  })

  it('uses fallback values when prompt is empty', () => {
    const result = buildRefinementCopy({
      isGeneratingPrompt: false,
      prompt: null,
      submittedQuery: 'stroller',
    })

    expect(result.titleQuestion).toBe('What should we optimize for with this stroller?')
  })

  it('clears the title question while generating', () => {
    const result = buildRefinementCopy({
      isGeneratingPrompt: true,
      prompt: null,
      submittedQuery: 'stroller',
    })

    expect(result.titleQuestion).toBe('')
    expect(result.titleEyebrow).toBe('Preparing your question')
  })
})

describe('clampFollowUpNotes', () => {
  it('passes through short strings', () => {
    expect(clampFollowUpNotes('hello')).toBe('hello')
  })

  it('returns empty string for null/undefined', () => {
    expect(clampFollowUpNotes(null)).toBe('')
    expect(clampFollowUpNotes(undefined)).toBe('')
  })
})

describe('addChipToNotes', () => {
  it('sets the chip as the notes when notes are empty', () => {
    expect(addChipToNotes('', 'Good value')).toBe('Good value')
  })

  it('appends a chip to existing notes', () => {
    expect(addChipToNotes('lightweight', 'Good value')).toBe('lightweight, Good value')
  })

  it('does not duplicate an existing chip', () => {
    expect(addChipToNotes('Good value', 'Good value')).toBe('Good value')
  })
})

describe('normalizeRefinementChips', () => {
  it('normalizes string chips', () => {
    expect(normalizeRefinementChips({ refinementSuggestions: ['  a  ', 'b'] })).toEqual([
      { label: 'a' },
      { label: 'b' },
    ])
  })

  it('normalizes object chips with prompts', () => {
    expect(
      normalizeRefinementChips({
        refinementSuggestions: [{ label: 'Price', prompt: 'under $200' }],
      }),
    ).toEqual([{ label: 'Price', prompt: 'under $200' }])
  })

  it('caps at 4 answers', () => {
    expect(
      normalizeRefinementChips({ refinementSuggestions: ['a', 'b', 'c', 'd'] }),
    ).toHaveLength(4)
  })

  it('returns empty array for missing input', () => {
    expect(normalizeRefinementChips(null)).toEqual([])
    expect(normalizeRefinementChips({})).toEqual([])
  })
})

describe('handleRefinementTextareaKeyDown', () => {
  it('calls onSubmit on Enter when canSubmit is true', () => {
    const onSubmit = vi.fn()
    const event = { key: 'Enter', shiftKey: false, nativeEvent: {}, preventDefault: vi.fn() }
    handleRefinementTextareaKeyDown(event, { canSubmit: true, onSubmit })
    expect(event.preventDefault).toHaveBeenCalled()
    expect(onSubmit).toHaveBeenCalled()
  })

  it('does nothing on Shift+Enter', () => {
    const onSubmit = vi.fn()
    const event = { key: 'Enter', shiftKey: true, nativeEvent: {}, preventDefault: vi.fn() }
    handleRefinementTextareaKeyDown(event, { canSubmit: true, onSubmit })
    expect(onSubmit).not.toHaveBeenCalled()
  })
})

describe('handleProductQueryTextareaKeyDown', () => {
  it('calls onSubmit on Enter when canSubmit is true', () => {
    const onSubmit = vi.fn()
    const event = { key: 'Enter', shiftKey: false, nativeEvent: {}, preventDefault: vi.fn() }
    handleProductQueryTextareaKeyDown(event, { canSubmit: true, onSubmit })
    expect(onSubmit).toHaveBeenCalled()
  })
})

describe('handleNewSearchClick', () => {
  it('prevents default and calls reset', () => {
    const event = { preventDefault: vi.fn() }
    const reset = vi.fn()
    handleNewSearchClick(event, reset)
    expect(event.preventDefault).toHaveBeenCalled()
    expect(reset).toHaveBeenCalled()
  })
})
