import { useEffect, useId, useState } from 'react'
import { useMutation } from '@tanstack/react-query'
import { MessageCircleMore, Send, X } from 'lucide-react'

import { Button } from '@/components/ui/button.jsx'
import { Input } from '@/components/ui/input.jsx'
import { Label } from '@/components/ui/label.jsx'
import { Textarea } from '@/components/ui/textarea.jsx'
import { submitTesterFeedback } from '@/lib/feedback.js'

const FEEDBACK_DELAY_MS = 12000
const FEEDBACK_DELAY_MS_MOBILE = 3500
const ANSWER_OPTIONS = ['Yes', 'Partly', 'No']

function getFeedbackDelayMs() {
  if (typeof window === 'undefined') {
    return FEEDBACK_DELAY_MS
  }

  return window.innerWidth < 640 ? FEEDBACK_DELAY_MS_MOBILE : FEEDBACK_DELAY_MS
}

function FeedbackChoiceField({ label, name, onChange, value }) {
  return (
    <fieldset className="space-y-2">
      <legend className="text-sm font-medium text-slate-900">{label}</legend>
      <div className="flex flex-wrap gap-2">
        {ANSWER_OPTIONS.map((option) => {
          const normalizedOption = option.toLowerCase()
          const isActive = value === normalizedOption

          return (
            <button
              key={option}
              type="button"
              aria-label={`${label}: ${option}`}
              aria-pressed={isActive}
              className={`rounded-full border px-3 py-1.5 text-sm transition ${
                isActive
                  ? 'border-primary bg-primary text-primary-foreground shadow-[0_10px_28px_-18px_rgba(37,99,235,0.9)]'
                  : 'border-stone-200 bg-white text-slate-700 hover:border-stone-300 hover:bg-stone-50'
              }`}
              onClick={() => onChange(name, normalizedOption)}
            >
              {option}
            </button>
          )
        })}
      </div>
    </fieldset>
  )
}

function createInitialFormState() {
  return {
    email: '',
    enjoyedExperience: '',
    foundWhatYouWanted: '',
    freeText: '',
    wasSimple: '',
  }
}

export function FeedbackFab({
  finalized,
  hasStartedSearch,
  queryText,
  resultsSeen,
  searchId,
  selectedProductId,
  sessionId,
  stageReached,
}) {
  const [hasDelayElapsed, setHasDelayElapsed] = useState(false)
  const [isOpen, setIsOpen] = useState(false)
  const [isSubmitted, setIsSubmitted] = useState(false)
  const [formState, setFormState] = useState(createInitialFormState)
  const panelTitleId = useId()

  useEffect(() => {
    if (hasStartedSearch) {
      return undefined
    }

    const timerId = window.setTimeout(() => {
      setHasDelayElapsed(true)
    }, getFeedbackDelayMs())

    return () => {
      window.clearTimeout(timerId)
    }
  }, [hasStartedSearch])

  useEffect(() => {
    if (!isOpen) {
      return undefined
    }

    function handleEscape(event) {
      if (event.key === 'Escape') {
        setIsOpen(false)
      }
    }

    window.addEventListener('keydown', handleEscape)

    return () => {
      window.removeEventListener('keydown', handleEscape)
    }
  }, [isOpen])

  const feedbackMutation = useMutation({
    mutationFn: submitTesterFeedback,
    onSuccess: () => {
      setIsSubmitted(true)
    },
  })

  function updateField(name, value) {
    setFormState((current) => ({
      ...current,
      [name]: value,
    }))
  }

  function resetSheet() {
    setIsOpen(false)
    setIsSubmitted(false)
    setFormState(createInitialFormState())
    feedbackMutation.reset()
  }

  function handleSubmit(event) {
    event.preventDefault()

    const hasAnyAnswer = Boolean(
      formState.wasSimple ||
      formState.foundWhatYouWanted ||
      formState.enjoyedExperience ||
      formState.freeText.trim() ||
      formState.email.trim(),
    )

    if (!hasAnyAnswer || feedbackMutation.isPending) {
      return
    }

    const page = typeof window !== 'undefined' ? window.location.pathname || '/' : '/'

    feedbackMutation.mutate({
      email: formState.email,
      enjoyedExperience: formState.enjoyedExperience,
      finalized,
      foundWhatYouWanted: formState.foundWhatYouWanted,
      freeText: formState.freeText,
      page,
      queryText,
      resultsSeen,
      searchId,
      selectedProductId,
      sessionId,
      stageReached,
      wasSimple: formState.wasSimple,
    })
  }

  const isVisible = hasStartedSearch || hasDelayElapsed

  if (!isVisible) {
    return null
  }

  const hasAnyAnswer = Boolean(
    formState.wasSimple ||
    formState.foundWhatYouWanted ||
    formState.enjoyedExperience ||
    formState.freeText.trim() ||
    formState.email.trim(),
  )

  return (
    <div className="pointer-events-none fixed right-3 bottom-[calc(env(safe-area-inset-bottom,0px)+0.75rem)] left-3 z-[60] flex flex-col items-stretch gap-3 sm:right-6 sm:bottom-[calc(env(safe-area-inset-bottom,0px)+1.5rem)] sm:left-auto sm:max-w-[calc(100vw-3rem)] sm:items-end">
      {isOpen ? (
        <section
          role="dialog"
          aria-labelledby={panelTitleId}
          className="pointer-events-auto w-full rounded-[28px] border border-stone-200/90 bg-white/96 p-4 shadow-[0_24px_80px_-34px_rgba(15,23,42,0.35)] backdrop-blur sm:w-[min(24rem,calc(100vw-3rem))] sm:p-5"
        >
          <div className="flex items-start justify-between gap-3">
            <div className="space-y-1">
              <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-primary/70">
                Tester feedback
              </p>
              <h2 id={panelTitleId} className="text-lg font-medium text-slate-900">
                Help improve Focamai
              </h2>
              <p className="text-sm leading-6 text-slate-600">
                Tell us what felt clear, confusing, or missing.
              </p>
            </div>
            <Button
              type="button"
              size="icon"
              variant="ghost"
              className="h-9 w-9 rounded-full text-slate-500 hover:text-slate-900"
              onClick={resetSheet}
            >
              <X className="h-4 w-4" />
              <span className="sr-only">Close feedback</span>
            </Button>
          </div>

          {isSubmitted ? (
            <div className="mt-5 space-y-4 rounded-[22px] border border-emerald-100 bg-emerald-50/80 p-4 text-sm text-emerald-900">
              <p className="font-medium">Thanks. This helps a lot.</p>
              <p className="leading-6 text-emerald-800">
                Your feedback was sent with the current session context so we can understand where the experience felt strong or confusing.
              </p>
              <Button type="button" className="rounded-full px-4" onClick={resetSheet}>
                Close
              </Button>
            </div>
          ) : (
            <form className="mt-5 space-y-4" onSubmit={handleSubmit}>
              <FeedbackChoiceField
                label="Was it simple to use?"
                name="wasSimple"
                value={formState.wasSimple}
                onChange={updateField}
              />
              <FeedbackChoiceField
                label="Did you find what you wanted?"
                name="foundWhatYouWanted"
                value={formState.foundWhatYouWanted}
                onChange={updateField}
              />
              <FeedbackChoiceField
                label="Did you enjoy the experience?"
                name="enjoyedExperience"
                value={formState.enjoyedExperience}
                onChange={updateField}
              />

              <div className="space-y-2">
                <Label htmlFor="feedback-free-text" className="text-sm font-medium text-slate-900">
                  What was confusing or missing?
                </Label>
                <Textarea
                  id="feedback-free-text"
                  value={formState.freeText}
                  onChange={(event) => updateField('freeText', event.target.value)}
                  placeholder="Optional, but this is often the most helpful part."
                  className="min-h-24 resize-none rounded-[20px] border-stone-200 bg-stone-50/70 px-4 py-3 text-sm leading-6 focus-visible:ring-primary/40"
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="feedback-email" className="text-sm font-medium text-slate-900">
                  Optional: leave your email if you&apos;d be open to a quick follow-up
                </Label>
                <Input
                  id="feedback-email"
                  type="email"
                  value={formState.email}
                  onChange={(event) => updateField('email', event.target.value)}
                  placeholder="you@example.com"
                  className="h-11 rounded-[18px] border-stone-200 bg-stone-50/70 px-4"
                />
              </div>

              {feedbackMutation.error ? (
                <p className="text-sm text-red-600">
                  {feedbackMutation.error instanceof Error
                    ? feedbackMutation.error.message
                    : 'Unable to send feedback right now.'}
                </p>
              ) : null}

              <div className="flex items-center justify-between gap-3 pt-1">
                <p className="text-xs leading-5 text-slate-500">
                  Quick notes are enough. You do not need to answer everything.
                </p>
                <Button
                  type="submit"
                  disabled={!hasAnyAnswer || feedbackMutation.isPending}
                  className="rounded-full px-5"
                >
                  {feedbackMutation.isPending ? 'Sending...' : 'Send'}
                  <Send className="ml-2 h-4 w-4" />
                </Button>
              </div>
            </form>
          )}
        </section>
      ) : null}

      <Button
        type="button"
        aria-expanded={isOpen}
        className="pointer-events-auto h-12 w-full justify-center rounded-full border border-primary/20 bg-white/95 px-4 text-sm font-medium text-slate-900 shadow-[0_18px_44px_-24px_rgba(15,23,42,0.35)] hover:bg-white sm:w-auto"
        onClick={() => {
          setIsOpen(true)
        }}
      >
        <MessageCircleMore className="mr-2 h-4 w-4 text-primary" />
        Feedback
      </Button>
    </div>
  )
}
