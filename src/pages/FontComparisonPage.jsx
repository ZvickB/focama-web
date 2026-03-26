import wordmark from '@/assets/wordmark.PNG'

const fontDirections = [
  {
    name: 'Current Serif',
    family: 'Georgia, "Times New Roman", serif',
    note: 'Warmer and more editorial, but less aligned with a mobile-first UI system.',
  },
  {
    name: 'Manrope',
    family: '"Manrope", sans-serif',
    note: 'Soft, calm, and modern. Safest fit for the current product direction.',
  },
  {
    name: 'Plus Jakarta Sans',
    family: '"Plus Jakarta Sans", sans-serif',
    note: 'Slightly more polished and refined while still feeling easy to use.',
  },
  {
    name: 'Instrument Sans',
    family: '"Instrument Sans", sans-serif',
    note: 'More distinctive and design-forward without getting loud.',
  },
]

const sampleResults = [
  {
    title: 'Travel stroller for small trunks',
    body: 'Compact fold, smooth push, and easy airport handling without feeling flimsy.',
    meta: '$189  •  Best for city trips',
  },
  {
    title: 'Office chair for long desk sessions',
    body: 'Balanced support, simple controls, and a cleaner look than gamer-style chairs.',
    meta: '$249  •  Best for posture',
  },
]

function FontCard({ direction }) {
  return (
    <article
      className="flex h-full flex-col rounded-[32px] border border-white/70 bg-white/82 p-5 shadow-[0_28px_100px_-58px_rgba(15,23,42,0.3)] backdrop-blur sm:p-6"
      style={{ fontFamily: direction.family }}
    >
      <div className="space-y-4">
        <div className="space-y-2">
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">
            {direction.name}
          </p>
          <img
            src={wordmark}
            alt="Focamai"
            className="h-auto w-full max-w-[180px]"
          />
          <h2 className="text-3xl font-medium tracking-tight text-slate-900">
            What are you looking for today?
          </h2>
          <p className="max-w-md text-sm leading-7 text-slate-600">
            From too many choices to yours. Describe the product, add a bit of context, and get a
            calmer shortlist before the marketplace.
          </p>
        </div>

        <div className="rounded-[28px] border border-stone-200 bg-[#fffdf9] px-5 py-4 text-base text-slate-900">
          travel stroller for a 6 year old, under $200, easy to fold
        </div>

        <div className="rounded-[26px] border border-primary/15 bg-primary/5 p-4">
          <p className="text-sm font-medium text-primary">AI refinement</p>
          <p className="mt-2 text-lg font-medium leading-8 text-slate-900">
            What matters most here: compact size, comfort, or easiest fold?
          </p>
          <p className="mt-2 text-sm leading-7 text-slate-600">
            Add any context that will help narrow the shortlist more intelligently.
          </p>
        </div>

        <div className="grid gap-3">
          {sampleResults.map((result) => (
            <div
              key={result.title}
              className="rounded-[24px] border border-stone-200/80 bg-stone-50/70 p-4"
            >
              <p className="text-lg font-semibold tracking-tight text-slate-900">{result.title}</p>
              <p className="mt-2 text-sm leading-7 text-slate-600">{result.body}</p>
              <p className="mt-3 text-sm font-medium text-slate-900">{result.meta}</p>
            </div>
          ))}
        </div>
      </div>

      <p className="mt-5 border-t border-stone-200/80 pt-4 text-sm leading-7 text-slate-600">
        {direction.note}
      </p>
    </article>
  )
}

function FontComparisonPage() {
  return (
    <main className="px-3 py-6 sm:px-6 sm:py-8 lg:px-8">
      <div className="mx-auto max-w-7xl space-y-6">
        <section className="max-w-3xl space-y-3">
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">
            Internal preview
          </p>
          <h1 className="text-3xl font-semibold tracking-tight text-slate-900 sm:text-4xl">
            Font comparison for Focamai
          </h1>
          <p className="text-base leading-7 text-slate-600">
            Same homepage-style content, four type directions. This is meant to answer the brand
            question visually: calm, focused, mobile-first, and not marketplace-shaped.
          </p>
        </section>

        <section className="grid gap-4 xl:grid-cols-2">
          {fontDirections.map((direction) => (
            <FontCard key={direction.name} direction={direction} />
          ))}
        </section>
      </div>
    </main>
  )
}

export default FontComparisonPage
