import { useMemo, useState } from 'react'
import {
  Clock3,
  Compass,
  NotebookTabs,
  Search,
  ShieldCheck,
  Star,
  Wand2,
} from 'lucide-react'
import Textarea from '@/components/Textarea.jsx'
import { Badge } from '@/components/ui/badge.jsx'
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card.jsx'

const guideCatalog = {
  lego: [
    {
      id: 1,
      title: 'Start with open-ended sets',
      subtitle: 'Best first filter',
      description:
        'For a child who enjoys stories and imagination, prioritize sets that can be rebuilt into several scenes instead of one highly specific display model.',
      reasons: [
        'Open-ended pieces support replay value',
        'Story-driven kids usually enjoy characters, vehicles, and scenery together',
        'A flexible set is safer than guessing one exact fandom',
      ],
    },
    {
      id: 2,
      title: 'Match the build complexity to age',
      subtitle: 'Avoid frustration',
      description:
        'A nine-year-old can often handle multi-bag builds, but the sweet spot is a model that feels rewarding without turning into an adult-led project halfway through.',
      reasons: [
        'Too few pieces can feel forgettable',
        'Too many small steps can kill momentum',
        'Look for a clear age range and manageable session length',
      ],
    },
    {
      id: 3,
      title: 'Use gift goals instead of brand hype',
      subtitle: 'Decision shortcut',
      description:
        'Choose whether the gift should create a big opening moment, support daily play, or be a special shared activity. That narrows the field faster than browsing endless sets.',
      reasons: [
        'Big opening moment usually means a larger centerpiece set',
        'Daily play leans toward modular or city-style builds',
        'Shared activity favors balanced difficulty and longer build time',
      ],
    },
    {
      id: 4,
      title: 'Questions to answer before you buy',
      subtitle: 'Quick checklist',
      description:
        'Before picking a set, decide your budget, whether the child prefers vehicles or scenes, and whether this is for solo play or a parent-child activity.',
      reasons: [
        'Budget keeps the shortlist realistic',
        'Theme preference prevents random guessing',
        'Solo vs shared play changes ideal difficulty',
      ],
    },
  ],
  chair: [
    {
      id: 5,
      title: 'Support beats style',
      subtitle: 'Best first rule',
      description:
        'For long study or work sessions, adjustability and lumbar support matter more than whether a chair looks sleek in photos.',
      reasons: [
        'Seat depth and back support affect all-day comfort',
        'Armrest adjustability matters if the user types often',
        'A flashy shape can still feel bad after two hours',
      ],
    },
    {
      id: 6,
      title: 'Shop by session length',
      subtitle: 'Useful filter',
      description:
        'If someone sits for multiple hours at a time, prioritize a chair with clear ergonomic features instead of a lightweight occasional-use model.',
      reasons: [
        'Short sessions allow simpler seating',
        'Long sessions demand stronger support',
        'Usage pattern is usually more important than room style',
      ],
    },
    {
      id: 7,
      title: 'What to compare',
      subtitle: 'Core specs',
      description:
        'Compare seat height range, armrest movement, tilt behavior, and cushion firmness before worrying about the rest of the feature list.',
      reasons: [
        'Those features change comfort the most',
        'They are easier to compare than marketing terms',
        'A shorter checklist helps prevent decision fatigue',
      ],
    },
    {
      id: 8,
      title: 'Questions to answer before you buy',
      subtitle: 'Quick checklist',
      description:
        'Measure the desk height, estimate daily sitting time, and decide whether you need a chair that disappears visually or one built for maximum support.',
      reasons: [
        'Desk height affects fit immediately',
        'Daily use drives how much to invest',
        'Room constraints can eliminate bulky options early',
      ],
    },
  ],
  stroller: [
    {
      id: 9,
      title: 'Airport convenience comes first',
      subtitle: 'Best first filter',
      description:
        'For travel, the best stroller is usually the one that folds fast, steers easily, and is simple to carry through transitions.',
      reasons: [
        'Fast folding matters at security and boarding',
        'Light carry weight reduces stress in transit',
        'Compact shape matters more than extra accessories',
      ],
    },
    {
      id: 10,
      title: 'Prioritize one-handed handling',
      subtitle: 'High-value feature',
      description:
        'Parents moving through airports often need one hand free for bags, tickets, or another child, so everyday usability matters more than a long feature list.',
      reasons: [
        'A difficult fold becomes frustrating quickly',
        'Simple steering helps in crowded spaces',
        'Real travel ease beats theoretical versatility',
      ],
    },
    {
      id: 11,
      title: 'What to compare',
      subtitle: 'Core specs',
      description:
        'Focus on folded size, stroller weight, canopy coverage, recline, and storage access instead of trying to compare everything at once.',
      reasons: [
        'Those specs affect travel day performance directly',
        'They create clearer tradeoffs',
        'A tight shortlist is easier to evaluate calmly',
      ],
    },
    {
      id: 12,
      title: 'Questions to answer before you buy',
      subtitle: 'Quick checklist',
      description:
        'Think about child age, nap needs, airline use, and whether this stroller is for daily life too or mainly for travel.',
      reasons: [
        'Recline matters more for younger children',
        'Airline use changes size priorities',
        'A dual-purpose stroller may justify more weight',
      ],
    },
  ],
  default: [
    {
      id: 13,
      title: 'Begin with the real use case',
      subtitle: 'Best first step',
      description:
        'The fastest way to narrow a product search is to describe who it is for, how often it will be used, and what would make it feel like a win.',
      reasons: [
        'Use case beats generic feature hunting',
        'Frequency helps separate essentials from nice-to-haves',
        'A clear success definition makes comparison easier',
      ],
    },
    {
      id: 14,
      title: 'Compare only a few things',
      subtitle: 'Stay focused',
      description:
        'Pick three to five comparison points before shopping. That usually prevents the spiral where every product starts looking the same.',
      reasons: [
        'Too many criteria slows decisions',
        'A short list is easier to apply consistently',
        'Clarity helps the final choice feel grounded',
      ],
    },
    {
      id: 15,
      title: 'Watch for the tradeoff',
      subtitle: 'Most important habit',
      description:
        'Most purchases involve one key tradeoff like price versus longevity or portability versus comfort. Naming it early saves time.',
      reasons: [
        'Tradeoffs are easier to manage than endless options',
        'It keeps expectations realistic',
        'It leads to more confident choices',
      ],
    },
    {
      id: 16,
      title: 'Questions to answer before you buy',
      subtitle: 'Quick checklist',
      description:
        'List your budget, your must-haves, your deal-breakers, and whether this is a gift, a daily-use item, or a one-time purchase.',
      reasons: [
        'Budget defines the playing field',
        'Must-haves protect against regret',
        'Purchase context changes what matters most',
      ],
    },
  ],
}

const starterPrompts = [
  {
    label: 'Lego for a creative 9-year-old',
    query: 'lego',
    details: 'For a 9 year old boy who enjoys imagination and building stories.',
  },
  {
    label: 'Comfortable office chair for long learning sessions',
    query: 'chair',
    details: 'For long study sessions at a desk with comfort and posture support as the main priority.',
  },
  {
    label: 'Travel stroller for easy airport use',
    query: 'stroller',
    details: 'For airport travel with a child, where easy folding and carrying matter more than extra accessories.',
  },
]

function HomePage() {
  const [productQuery, setProductQuery] = useState('')
  const [details, setDetails] = useState('')
  const [isLoading, setIsLoading] = useState(false)
  const [submittedQuery, setSubmittedQuery] = useState('lego')

  const results = useMemo(() => {
    const key = submittedQuery.trim().toLowerCase()
    return guideCatalog[key] ?? guideCatalog.default
  }, [submittedQuery])

  function handleSubmit(event) {
    event.preventDefault()
    setIsLoading(true)

    window.setTimeout(() => {
      setSubmittedQuery(productQuery || 'default')
      setIsLoading(false)
    }, 450)
  }

  return (
    <main className="relative min-h-screen overflow-hidden px-3 py-4 sm:px-6 sm:py-6 lg:px-8">
      <div className="mx-auto flex w-full max-w-7xl flex-col gap-4 sm:gap-6">
        <section className="rounded-[28px] border border-white/70 bg-white/72 p-4 shadow-[0_30px_120px_-60px_rgba(15,23,42,0.35)] backdrop-blur sm:rounded-[32px] sm:p-5 lg:p-8">
          <div className="flex flex-col gap-5 lg:grid lg:grid-cols-[1.15fr_0.85fr] lg:items-start lg:gap-8">
            <div className="max-w-3xl space-y-4">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.22em] text-slate-500">
                  Focama
                </p>
                <p className="mt-1 text-sm text-slate-600">Distraction-light buying guidance</p>
              </div>
              <Badge variant="secondary" className="rounded-full px-4 py-1 text-sm">
                Focused shopping, not endless browsing
              </Badge>
              <div className="space-y-3">
                <h1 className="max-w-2xl text-3xl font-semibold tracking-tight text-slate-900 sm:text-5xl">
                  Start with a calmer buying brief.
                </h1>
                <p className="max-w-2xl text-sm leading-7 text-slate-600 sm:text-lg">
                  Focama helps people think through a purchase before they get lost in tabs, ads,
                  and endless product pages. Describe what you need and get a short original guide
                  centered on the decision itself.
                </p>
              </div>
              <div className="grid gap-3 sm:grid-cols-3">
                <div className="rounded-3xl border border-stone-200 bg-stone-50/80 p-4">
                  <Search className="h-5 w-5 text-primary" />
                  <p className="mt-4 text-sm font-medium text-slate-900">Intent first</p>
                  <p className="mt-1 text-sm leading-6 text-slate-600">
                    Start with who the item is for and what a good outcome looks like.
                  </p>
                </div>
                <div className="rounded-3xl border border-stone-200 bg-stone-50/80 p-4">
                  <Wand2 className="h-5 w-5 text-primary" />
                  <p className="mt-4 text-sm font-medium text-slate-900">Focused guidance</p>
                  <p className="mt-1 text-sm leading-6 text-slate-600">
                    Short decision notes and checklists instead of fake certainty.
                  </p>
                </div>
                <div className="rounded-3xl border border-stone-200 bg-stone-50/80 p-4">
                  <ShieldCheck className="h-5 w-5 text-primary" />
                  <p className="mt-4 text-sm font-medium text-slate-900">No clutter</p>
                  <p className="mt-1 text-sm leading-6 text-slate-600">
                    A simple pre-shopping layer that helps narrow the field calmly.
                  </p>
                </div>
              </div>
            </div>

            <Card className="w-full rounded-[28px] border-stone-200/80 bg-[#f8f3eb] shadow-none sm:rounded-[32px] lg:max-w-xl">
              <CardHeader className="space-y-3">
                <div className="flex items-center justify-between">
                  <Badge className="rounded-full bg-primary px-3 py-1 text-primary-foreground hover:bg-primary">
                    Buying brief
                  </Badge>
                  <span className="text-sm text-slate-500">Original guidance</span>
                </div>
                <CardTitle className="text-2xl text-slate-900">Describe what you need</CardTitle>
                <CardDescription className="text-base leading-7 text-slate-600">
                  This page gives a short recommendation brief with practical considerations,
                  comparison angles, and a few questions to answer before buying.
                </CardDescription>
                <p className="rounded-2xl border border-amber-200/80 bg-amber-50/90 px-4 py-3 text-sm leading-6 text-slate-700">
                  For now, Focama supports three sample topics: lego, chair, and stroller. After
                  Amazon Associates approval, the plan is to expand this into an AI-assisted buying
                  flow that can help with a much wider range of searches.
                </p>
              </CardHeader>
              <CardContent>
                <Textarea
                  productQuery={productQuery}
                  audience={details}
                  onAudienceChange={setProductQuery}
                  onDetailsChange={setDetails}
                  onSubmit={handleSubmit}
                  disabled={isLoading}
                />
              </CardContent>
            </Card>
          </div>
        </section>

        <section className="grid gap-4 lg:grid-cols-[1.4fr_0.6fr] lg:gap-6">
          <Card className="order-2 rounded-[28px] border-white/70 bg-white/72 shadow-[0_30px_120px_-60px_rgba(15,23,42,0.35)] backdrop-blur sm:rounded-[32px] lg:order-1">
            <CardHeader className="flex flex-col gap-4">
              <div className="space-y-2">
                <Badge variant="outline" className="rounded-full bg-stone-50 px-3 py-1">
                  Recommendation brief
                </Badge>
                <CardTitle className="text-2xl text-slate-900 sm:text-3xl">
                  {isLoading ? 'Building your brief...' : `How to think about "${submittedQuery}"`}
                </CardTitle>
                <CardDescription className="max-w-2xl text-sm leading-7 text-slate-600 sm:text-base">
                  {isLoading
                    ? 'Pulling together a short focused brief so the interface stays easy to scan.'
                    : details}
                </CardDescription>
              </div>
              <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <div className="inline-flex w-fit items-center gap-2 rounded-full bg-stone-100 px-3 py-2 text-xs font-medium uppercase tracking-[0.18em] text-slate-500">
                  Read top-to-bottom
                </div>
                <p className="max-w-md text-sm leading-6 text-slate-500 sm:text-right">
                  These are original recommendation notes, not live store listings.
                </p>
              </div>
            </CardHeader>
            <CardContent>
              <div className="grid gap-3 sm:gap-5 xl:grid-cols-2">
                {results.map((item) => (
                  <Card
                    key={item.id}
                    className="rounded-[24px] border-stone-200/80 bg-white/90 shadow-[0_24px_80px_-48px_rgba(15,23,42,0.45)] sm:rounded-[28px]"
                  >
                    <CardHeader className="space-y-3 p-5 sm:p-6">
                      <Badge className="w-fit rounded-full bg-stone-100 px-3 py-1 text-slate-700 hover:bg-stone-100">
                        {item.subtitle}
                      </Badge>
                      <CardTitle className="text-xl leading-7 text-slate-900">
                        {item.title}
                      </CardTitle>
                      <CardDescription className="text-sm leading-7 text-slate-600">
                        {item.description}
                      </CardDescription>
                    </CardHeader>
                    <CardContent className="space-y-3 p-5 pt-0 text-sm leading-6 text-slate-600 sm:p-6 sm:pt-0">
                      {item.reasons.map((reason) => (
                        <div key={reason} className="flex items-start gap-3">
                          <Star className="mt-1 h-4 w-4 text-amber-500" />
                          <span>{reason}</span>
                        </div>
                      ))}
                    </CardContent>
                  </Card>
                ))}
              </div>
            </CardContent>
          </Card>

          <div className="order-1 space-y-4 lg:order-2 lg:space-y-6">
            <Card className="rounded-[28px] border-white/70 bg-white/72 shadow-[0_30px_120px_-60px_rgba(15,23,42,0.35)] backdrop-blur sm:rounded-[32px]">
              <CardHeader>
                <div className="flex items-center gap-2 text-slate-700">
                  <Clock3 className="h-4 w-4 text-primary" />
                  <CardTitle className="text-xl">Starting prompts</CardTitle>
                </div>
                <CardDescription className="leading-7 text-slate-600">
                  Try one of these common shopping situations.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-3">
                {starterPrompts.map((item) => (
                  <button
                    key={item.label}
                    type="button"
                    className="flex w-full items-center justify-between rounded-2xl border border-stone-200 bg-stone-50/80 px-4 py-3 text-left text-sm text-slate-700 transition hover:border-primary/30 hover:bg-white"
                    onClick={() => {
                      setProductQuery(item.query)
                      setDetails(item.details)
                    }}
                  >
                    <span>{item.label}</span>
                    <Search className="h-4 w-4 text-slate-400" />
                  </button>
                ))}
              </CardContent>
            </Card>

            <Card className="rounded-[28px] border-white/70 bg-[#16343a] text-white shadow-[0_30px_120px_-60px_rgba(8,47,73,0.7)] sm:rounded-[32px]">
              <CardHeader>
                <div className="flex items-center gap-2">
                  <Compass className="h-4 w-4 text-amber-300" />
                  <CardTitle className="text-xl">What makes a good brief</CardTitle>
                </div>
                <CardDescription className="leading-7 text-white/70">
                  The goal is to reduce indecision before you ever click into a marketplace.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4 text-sm leading-6 text-white/80">
                <div className="flex items-start gap-3">
                  <Star className="mt-0.5 h-4 w-4 text-amber-300" />
                  Name the user, the setting, and the success criteria
                </div>
                <div className="flex items-start gap-3">
                  <Star className="mt-0.5 h-4 w-4 text-amber-300" />
                  Keep the comparison criteria short and clear
                </div>
                <div className="flex items-start gap-3">
                  <Star className="mt-0.5 h-4 w-4 text-amber-300" />
                  Decide the main tradeoff before shopping
                </div>
              </CardContent>
            </Card>

            <Card className="rounded-[28px] border-white/70 bg-white/72 shadow-[0_30px_120px_-60px_rgba(15,23,42,0.35)] backdrop-blur sm:rounded-[32px]">
              <CardHeader>
                <div className="flex items-center gap-2 text-slate-700">
                  <NotebookTabs className="h-4 w-4 text-primary" />
                  <CardTitle className="text-xl">Current guide topics</CardTitle>
                </div>
                <CardDescription className="leading-7 text-slate-600">
                  Enough real content to show the direction of the site before affiliate links are
                  added.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-3 text-sm leading-6 text-slate-600">
                <p>Lego gifts for imaginative 9-year-olds</p>
                <p>Office chair basics for long learning sessions</p>
                <p>Travel stroller considerations for airport use</p>
              </CardContent>
            </Card>
          </div>
        </section>
      </div>
    </main>
  )
}

export default HomePage
