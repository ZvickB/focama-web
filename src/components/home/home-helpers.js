import { MAX_DETAILS_LENGTH } from '../../../shared/search-input.js'

export function applyPlainBackgroundMode() {
  if (typeof document === 'undefined') {
    return
  }

  document.documentElement.dataset.bgMode = 'plain'
}

export function shouldShowCharCounter(current, max) {
  return current > 0 && max - current <= 20
}

export function shouldShowTimingPanel() {
  if (import.meta.env.DEV) {
    return true
  }

  if (typeof window === 'undefined') {
    return false
  }

  const searchParams = new URLSearchParams(window.location.search)
  return searchParams.get('timing') === '1'
}

export function handleRefinementTextareaKeyDown(event, { canSubmit, onSubmit }) {
  if (event.key !== 'Enter' || event.shiftKey || event.nativeEvent?.isComposing) {
    return
  }

  event.preventDefault()

  if (canSubmit) {
    onSubmit()
  }
}

export function handleProductQueryTextareaKeyDown(event, { canSubmit, onSubmit }) {
  if (event.key !== 'Enter' || event.shiftKey || event.nativeEvent?.isComposing) {
    return
  }

  event.preventDefault()

  if (canSubmit) {
    onSubmit()
  }
}

export function smoothScrollIntoView(element) {
  if (!element || typeof element.scrollIntoView !== 'function') {
    return
  }

  element.scrollIntoView({
    behavior: 'smooth',
    block: 'start',
  })
}

export function scrollElementNearTop(element, offset = 24) {
  if (!element || typeof window === 'undefined') {
    return
  }

  const nextTop = Math.max(0, window.scrollY + element.getBoundingClientRect().top - offset)

  window.scrollTo({
    top: nextTop,
    behavior: 'smooth',
  })
}

export function handleNewSearchClick(event, resetToNewSearch) {
  event.preventDefault()
  resetToNewSearch()
}

export function formatTimingValue(value) {
  return Number.isFinite(value) ? `${value.toFixed(1)} ms` : 'n/a'
}

export function buildRefinementCopy({ isGeneratingPrompt, prompt, submittedQuery }) {
  const suggestedQuestion =
    prompt?.prompt || `What should we optimize for with this ${submittedQuery}?`

  return {
    helper: isGeneratingPrompt ? 'Finding the most useful thing to ask…' : prompt?.helperText || '',
    placeholder:
      prompt?.followUpPlaceholder ||
      'Example: I want something lightweight for daily travel, under $200, and easy to clean.',
    titleEyebrow: isGeneratingPrompt ? 'Preparing your question' : 'Focamai asks:',
    titleQuestion: isGeneratingPrompt ? '' : suggestedQuestion,
  }
}

export function clampFollowUpNotes(value) {
  return String(value ?? '').slice(0, MAX_DETAILS_LENGTH)
}

export function addChipToNotes(currentNotes, chipLabel) {
  const trimmedNotes = String(currentNotes ?? '').trim()

  if (!trimmedNotes) {
    return clampFollowUpNotes(chipLabel)
  }

  if (trimmedNotes.toLowerCase().includes(String(chipLabel).toLowerCase())) {
    return currentNotes
  }

  return clampFollowUpNotes(`${trimmedNotes}, ${chipLabel}`)
}

export function normalizeRefinementChips(refinementPrompt) {
  const suggestedRefinements =
    refinementPrompt?.answerOptions ||
    refinementPrompt?.refinementSuggestions ||
    refinementPrompt?.refinement_suggestions ||
    refinementPrompt?.suggestedRefinements ||
    []

  if (!Array.isArray(suggestedRefinements)) {
    return []
  }

  return suggestedRefinements
    .map((chip) => {
      if (typeof chip === 'string') {
        return { label: chip.trim() }
      }

      if (typeof chip?.label === 'string') {
        const label = chip.label.trim()
        const prompt = typeof chip.prompt === 'string' ? chip.prompt.trim() : ''
        return prompt ? { label, prompt } : { label }
      }

      return null
    })
    .filter((chip) => chip?.label)
    .slice(0, 4)
}
