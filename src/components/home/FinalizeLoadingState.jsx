import { useEffect, useState } from 'react'
import { CheckCircle2, LoaderCircle } from 'lucide-react'

const FINALIZE_STAGES = [
  'Reading your search',
  'Applying your notes',
  'Narrowing to six picks',
  'Getting the shortlist ready',
]

export function FinalizeLoadingState({ compact = false }) {
  const [activeStageIndex, setActiveStageIndex] = useState(0)

  useEffect(() => {
    const intervalId = window.setInterval(() => {
      setActiveStageIndex((current) => Math.min(current + 1, FINALIZE_STAGES.length - 1))
    }, 1100)

    return () => {
      window.clearInterval(intervalId)
    }
  }, [])

  return (
    <div
      role="status"
      aria-live="polite"
      className={`rounded-2xl border border-[#e7dac8] bg-white/90 text-left text-slate-600 shadow-[0_14px_38px_-32px_rgba(120,87,63,0.2)] transition-all duration-300 ${
        compact ? 'px-4 py-4 sm:px-5' : 'px-5 py-5 sm:px-6'
      }`}
    >
      <div className="flex items-start gap-3">
        <span className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-[#eef7f6] text-primary">
          <LoaderCircle className="h-4 w-4 animate-spin" />
        </span>
        <div className="min-w-0 flex-1 space-y-3">
          <div className="space-y-1">
            <p className="text-sm font-semibold text-slate-900">
              We&apos;re on it. Your results will be here soon.
            </p>
            <p className="text-sm leading-6 text-slate-600">
              Focamai is using your search and notes to lock a focused shortlist.
            </p>
          </div>

          <ol className="inline-grid grid-cols-2 gap-1.5">
            {FINALIZE_STAGES.map((stage, index) => {
              const isDone = index < activeStageIndex
              const isActive = index === activeStageIndex

              return (
                <li
                  key={stage}
                  className={`flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11px] font-medium whitespace-nowrap transition-colors ${
                    isActive
                      ? 'border-primary/30 bg-[#eef7f6] text-primary'
                      : isDone
                        ? 'border-[#e5dacb] bg-white text-[#80573f]'
                        : 'border-[#ece3d8] bg-white/70 text-slate-400'
                  }`}
                >
                  {isDone ? (
                    <CheckCircle2 className="h-3.5 w-3.5 shrink-0" />
                  ) : (
                    <span
                      className={`h-2 w-2 shrink-0 rounded-full ${
                        isActive ? 'bg-primary animate-soft-pulse' : 'bg-slate-300'
                      }`}
                    />
                  )}
                  <span>{stage}</span>
                </li>
              )
            })}
          </ol>
        </div>
      </div>
    </div>
  )
}

export default FinalizeLoadingState
