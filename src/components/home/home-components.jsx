import { CheckCircle2, PencilLine, Sparkles } from 'lucide-react'

import { ResultSkeleton } from '@/components/home/ResultSkeleton.jsx'
import { FinalizeLoadingState } from '@/components/home/FinalizeLoadingState.jsx'
import {
  addChipToNotes,
  buildRefinementCopy,
  clampFollowUpNotes,
  formatTimingValue,
  normalizeRefinementChips,
} from '@/components/home/home-helpers.js'
import { RESULT_CARD_SLOTS } from '@/components/home/useGuidedSearch.js'
import { Button } from '@/components/ui/button.jsx'

const DEFAULT_REFINEMENT_CHIPS = [
  { label: 'Good value' },
  { label: 'Easy to use' },
  { label: 'Fits my space' },
]

export function CharCounter({ current, max }) {
  if (current === 0) return null
  const remaining = max - current
  const pct = current / max
  return (
    <span className={`text-xs transition-colors ${
      pct >= 0.95 ? 'text-red-500' : pct >= 0.8 ? 'text-amber-500' : 'text-slate-400'
    }`}>
      {remaining} characters left
    </span>
  )
}

export function RefinementCopy({
  canAskDifferentQuestion = false,
  isGeneratingPrompt,
  isSwitchingQuestion = false,
  onAskDifferentQuestion,
  prompt,
  submittedQuery,
}) {
  const displayedCopy = buildRefinementCopy({ isGeneratingPrompt, prompt, submittedQuery })
  const isWaitingForQuestion = isGeneratingPrompt || isSwitchingQuestion

  return (
    <div className="space-y-4 text-center sm:text-left">
      <div className="space-y-2">
        <h2
          className="text-2xl font-semibold tracking-tight text-slate-950 sm:text-3xl"
          style={{ fontFamily: '"Manrope", sans-serif' }}
        >
          What should Focamai keep in mind?
        </h2>
        <p className="mx-auto max-w-2xl text-sm font-medium leading-6 text-slate-500 sm:mx-0 sm:text-[15px]">
          Add any preferences, must-haves, or deal breakers.
        </p>
      </div>
      <div className="rounded-2xl border border-[#e6d8c5] bg-white/90 p-4 shadow-[0_14px_36px_-30px_rgba(120,87,63,0.28)]">
        <div className="flex items-center justify-center gap-2 text-sm font-semibold text-[#80573f] sm:justify-start">
          <Sparkles className={`h-4 w-4 ${isWaitingForQuestion ? 'animate-pulse motion-reduce:animate-none' : ''}`} />
          <span>{displayedCopy.titleEyebrow}</span>
        </div>
        {isSwitchingQuestion ? (
          <div
            aria-label="Finding a different question"
            aria-live="polite"
            className="mt-4 flex items-center justify-center gap-2 sm:justify-start"
            role="status"
          >
            {[0, 1, 2].map((dot) => (
              <span
                key={dot}
                className="h-2.5 w-2.5 rounded-full bg-primary/65 animate-soft-pulse motion-reduce:animate-none"
                style={{ animationDelay: `${dot * 160}ms` }}
              />
            ))}
          </div>
        ) : displayedCopy.titleQuestion ? (
          <p
            className="mt-2 text-base font-medium leading-7 text-[#8f4e2f] transition-opacity duration-500 sm:text-lg"
            style={{ fontFamily: '"Manrope", sans-serif' }}
          >
            {displayedCopy.titleQuestion}
          </p>
        ) : null}
        <p className="mt-2 text-sm font-medium leading-6 text-slate-600 transition-opacity duration-300">
          {displayedCopy.helper}
          {isGeneratingPrompt ? (
            <span className="ml-0.5 inline-block h-4 w-px translate-y-0.5 animate-pulse bg-slate-400 align-middle motion-reduce:animate-none" />
          ) : null}
        </p>
        {canAskDifferentQuestion ? (
          <button
            type="button"
            className="mt-3 text-sm font-semibold text-primary underline decoration-primary/25 underline-offset-4 transition-colors hover:text-primary/80 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/20"
            onClick={onAskDifferentQuestion}
          >
            Ask a different question
          </button>
        ) : null}
      </div>
    </div>
  )
}

export function RefinementChips({
  disabled,
  followUpNotes,
  onFollowUpNotesChange,
  refinementPrompt,
}) {
  const normalizedChips = normalizeRefinementChips(refinementPrompt)
  const visibleChips = normalizedChips.length ? normalizedChips : DEFAULT_REFINEMENT_CHIPS

  function handleChipClick(chip) {
    if (disabled) {
      return
    }

    if (chip.prompt) {
      onFollowUpNotesChange(clampFollowUpNotes(chip.prompt))
      return
    }

    onFollowUpNotesChange(addChipToNotes(followUpNotes, chip.label))
  }

  return (
    <div className="space-y-3">
      <p className="text-sm font-semibold text-slate-500">A few starting points</p>
      <div className="grid gap-2 sm:grid-cols-3">
        {visibleChips.map((chip) => {
          const selected = String(followUpNotes ?? '')
            .toLowerCase()
            .includes(chip.label.toLowerCase())

          return (
            <button
              key={chip.label}
              type="button"
              aria-pressed={selected}
              disabled={disabled}
              className={`min-h-12 rounded-full border px-4 py-2 text-center text-sm font-semibold transition-colors disabled:pointer-events-none disabled:opacity-50 ${
                selected
                  ? 'border-primary/45 bg-[#eef7f6] text-primary'
                  : 'border-[#e5dacb] bg-[#f8f4ee] text-slate-800 hover:border-primary/30 hover:bg-white'
              }`}
              onClick={() => handleChipClick(chip)}
            >
              {chip.label}
            </button>
          )
        })}
      </div>
    </div>
  )
}
export function TimingPanel({ requestTiming }) {
  const entries = [
    ['Discover', requestTiming?.discover],
    ['Refine', requestTiming?.refine],
    ['Finalize', requestTiming?.finalize],
  ].filter(([, timing]) => timing)

  if (entries.length === 0) {
    return null
  }

  return (
    <section className="w-full max-w-5xl rounded-2xl border border-dashed border-[#e6dacb] bg-white/80 p-4 sm:p-5">
      <div className="space-y-1">
        <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">
          Dev timing
        </p>
        <p className="text-sm leading-6 text-slate-600">
          Compare browser round-trip time with backend stage timings from the `Server-Timing` header.
        </p>
      </div>

      <div className="mt-4 grid gap-3 md:grid-cols-3">
        {entries.map(([label, timing]) => (
          <div
            key={label}
            className="rounded-2xl border border-[#ece1d3] bg-white p-4 text-sm text-slate-600"
          >
            <p className="font-medium text-slate-900">{label}</p>
            <p className="mt-2">Client total: {formatTimingValue(timing?.client?.totalMs)}</p>
            <p>Client round trip: {formatTimingValue(timing?.client?.roundTripMs)}</p>
            <p>Response read: {formatTimingValue(timing?.client?.responseReadMs)}</p>
            <p className="mt-2">Backend total: {formatTimingValue(timing?.server?.total)}</p>
            {Object.entries(timing?.server || {})
              .filter(([name]) => name !== 'total')
              .map(([name, value]) => (
                <p key={name}>
                  {name}: {formatTimingValue(value)}
                </p>
              ))}
          </div>
        ))}
      </div>
    </section>
  )
}

export function QuerySuggestionPrompt({
  isApplying,
  onKeepResults,
  onTrySuggestedSearch,
  suggestion,
}) {
  if (!suggestion?.suggestedQuery) {
    return null
  }

  return (
    <div
      role="status"
      aria-live="polite"
      className="rounded-2xl border border-[#d9e6e8] bg-white/92 p-4 shadow-[0_14px_36px_-30px_rgba(15,97,117,0.22)] sm:flex sm:items-center sm:justify-between sm:gap-4"
    >
      <div className="min-w-0 space-y-1 text-left">
        <p className="text-sm font-medium text-slate-600">
          We searched for &quot;{suggestion.originalQuery || suggestion.query}&quot;.
        </p>
        <p className="break-words text-base font-semibold text-[#155f70]">
          Try &quot;{suggestion.suggestedQuery}&quot; instead?
        </p>
      </div>
      <div className="mt-3 flex flex-col gap-2 sm:mt-0 sm:flex-row sm:items-center">
        <Button
          type="button"
          disabled={isApplying}
          className="h-11 w-full rounded-2xl bg-primary px-4 text-sm text-primary-foreground shadow-[0_14px_32px_-24px_rgba(15,97,117,0.32)] hover:bg-primary/90 sm:w-auto"
          onClick={onTrySuggestedSearch}
        >
          {isApplying ? 'Starting...' : 'Try suggested search'}
        </Button>
        <button
          type="button"
          className="h-11 w-full rounded-2xl px-4 text-sm font-medium text-slate-500 transition-colors hover:text-slate-800 sm:w-auto"
          onClick={onKeepResults}
        >
          Keep these results
        </button>
      </div>
    </div>
  )
}

export function FlowStageSummary({
  actionLabel,
  children,
  label,
  onAction,
  status = 'Done',
}) {
  return (
    <div className="w-full rounded-2xl border border-[#e6dacb] bg-white/92 px-4 py-3 shadow-[0_14px_36px_-30px_rgba(120,87,63,0.22)] backdrop-blur sm:px-5">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex min-w-0 items-start gap-3">
          <span className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-[#eef7f6] text-primary">
            <CheckCircle2 className="h-4 w-4" />
          </span>
          <div className="min-w-0 space-y-1">
            <div className="flex flex-wrap items-center gap-2">
              <p className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-400">
                {label}
              </p>
              <span className="rounded-full bg-[#f6efe7] px-2 py-0.5 text-xs font-medium text-[#80573f]">
                {status}
              </span>
            </div>
            <div className="min-w-0 text-sm font-medium leading-6 text-slate-700 sm:text-[15px]">
              {children}
            </div>
          </div>
        </div>
        {onAction ? (
          <button
            type="button"
            className="inline-flex h-10 shrink-0 items-center justify-center gap-2 rounded-full px-3 text-sm font-medium text-slate-500 transition-colors hover:bg-stone-100/80 hover:text-slate-800"
            onClick={onAction}
          >
            <PencilLine className="h-4 w-4" />
            {actionLabel}
          </button>
        ) : null}
      </div>
    </div>
  )
}

export function FlowProgress({ hasDiscoveryResults, hasFinalResults, hasStartedSearch }) {
  const steps = [
    { key: 'search', label: 'Search', active: !hasStartedSearch, done: hasStartedSearch },
    {
      key: 'refine',
      label: 'Refine',
      active: hasStartedSearch && !hasFinalResults,
      done: hasFinalResults,
    },
    { key: 'picks', label: 'Picks', active: hasFinalResults, done: hasFinalResults },
  ]

  return (
    <div
      aria-label="Search progress"
      className="mx-auto flex w-full max-w-md items-center justify-center gap-2 text-[12px] font-semibold uppercase tracking-[0.14em] sm:text-sm"
      style={{ fontFamily: '"Instrument Sans", sans-serif' }}
    >
      {steps.map((step, index) => (
        <div key={step.key} className="flex min-w-0 items-center gap-2">
          <span
            className={`whitespace-nowrap transition-colors ${
              step.active
                ? 'text-primary'
                : step.done || (step.key === 'refine' && hasDiscoveryResults)
                  ? 'text-[#80573f]'
                  : 'text-slate-400'
            }`}
          >
            {step.label}
          </span>
          {index < steps.length - 1 ? <span className="text-slate-300">/</span> : null}
        </div>
      ))}
    </div>
  )
}


export function ResultsSectionFallback({
  rankingPreference = 'balanced',
  retrySearchQuery = '',
  showFinalizeStatus = false,
  submittedQuery = '',
}) {
  if (retrySearchQuery) {
    return (
      <div className="rounded-[28px] border border-[#e7dac8] bg-white/94 p-6 text-center shadow-[0_24px_64px_-50px_rgba(120,87,63,0.22)] sm:p-8">
        <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full border border-primary/20 bg-[#eef7f6] text-primary">
          <Sparkles className="h-5 w-5 animate-pulse motion-reduce:animate-none" />
        </div>
        <h2 className="mt-4 text-2xl font-semibold tracking-tight text-slate-900">
          We&apos;re updating your picks based on your feedback.
        </h2>
        <p className="mx-auto mt-2 max-w-xl text-sm leading-6 text-slate-600">
          Focamai is using a sharper search to find six picks that fit better.
        </p>
        <div className="mt-6 rounded-[22px] border border-[#e5dacb] bg-[#fbf7f1] p-4 text-left">
          <p className="text-xs font-semibold uppercase tracking-[0.12em] text-slate-500">
            Improved search we&apos;re using
          </p>
          <p className="mt-2 text-base font-semibold leading-6 text-primary">{retrySearchQuery}</p>
          <p className="mt-3 text-sm leading-5 text-slate-600">Based on your Improve picks feedback.</p>
        </div>
        <p role="status" className="mt-5 text-sm text-slate-500">Finding better matches…</p>
      </div>
    )
  }

  return (
    <div className="space-y-4">
      {showFinalizeStatus ? (
        <FinalizeLoadingState
          rankingPreference={rankingPreference}
          submittedQuery={submittedQuery}
        />
      ) : null}
      <div className="mobile-landscape-results-grid grid grid-cols-1 gap-4">
        {RESULT_CARD_SLOTS.map((index) => (
          <ResultSkeleton key={index} className="opacity-95" />
        ))}
      </div>
    </div>
  )
}

export function ProductDetailModalFallback() {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-[rgba(51,39,30,0.22)] backdrop-blur-[2px]">
      <div className="rounded-full border border-[#e7dac8] bg-white/96 px-4 py-3 text-sm text-slate-600 shadow-[0_12px_32px_-26px_rgba(120,87,63,0.28)]">
        Loading details...
      </div>
    </div>
  )
}
