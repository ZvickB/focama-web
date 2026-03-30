import { ChevronRight, Star } from 'lucide-react'
import { Badge } from '@/components/ui/badge.jsx'
import {
  Card,
  CardContent,
} from '@/components/ui/card.jsx'

function getUserFacingReasons(reasons = []) {
  return reasons.filter((reason) => {
    const normalizedReason = String(reason || '').trim()

    if (!normalizedReason) {
      return false
    }

    return !/serpapi search route|live product result returned/i.test(normalizedReason)
  })
}

function getUserFacingDescription(description) {
  const normalizedDescription = String(description || '').trim()

  if (!normalizedDescription) {
    return ''
  }

  if (/serpapi search route|live product result returned/i.test(normalizedDescription)) {
    return ''
  }

  return normalizedDescription
}

function ProductBadge({ label }) {
  if (!label) {
    return null
  }

  const isPrimary = label === 'Best match'

  return (
    <div className="pointer-events-none absolute left-4 top-4 z-10">
      <div
        className={`inline-flex max-w-[min(220px,calc(100vw-4rem))] items-center gap-2 rounded-[20px] border px-3 py-2 text-xs font-medium leading-4 tracking-[0.01em] shadow-[0_14px_34px_-20px_rgba(15,23,42,0.45)] backdrop-blur ${
          isPrimary
            ? 'border-primary/60 bg-primary text-primary-foreground'
            : 'border-[#d9c4a6] bg-[rgba(244,231,210,0.94)] text-slate-800'
        }`}
        style={{ fontFamily: '"Instrument Sans", sans-serif', fontWeight: 500 }}
      >
        <span className="whitespace-normal break-words">{label}</span>
      </div>
    </div>
  )
}

function ProductCard({
  badgeLabel = '',
  description,
  image,
  link,
  onRetailerClick,
  onSelect,
  price,
  rating,
  reasons = [],
  reviewCount,
  subtitle,
  title,
}) {
  const primaryReason = getUserFacingReasons(reasons)[0] || ''
  const userFacingDescription = getUserFacingDescription(description)

  return (
    <Card
      className="group h-full overflow-hidden rounded-[22px] border-stone-200/80 bg-white/90 shadow-[0_24px_80px_-48px_rgba(15,23,42,0.45)] backdrop-blur transition hover:-translate-y-1"
      role="button"
      tabIndex={0}
      onClick={onSelect}
      onKeyDown={(event) => {
        if (event.key === 'Enter' || event.key === ' ') {
          event.preventDefault()
          onSelect?.()
        }
      }}
    >
      <div className="relative overflow-hidden border-b border-stone-100 bg-stone-50">
        <ProductBadge label={badgeLabel} />
        <img
          className="aspect-square w-full object-contain bg-stone-50 p-4 transition duration-300 group-hover:scale-[1.02]"
          src={image}
          alt={title}
          loading="lazy"
          decoding="async"
        />
      </div>
      <CardContent className="space-y-3 p-4">
        <div className="space-y-2">
          <Badge
            variant="outline"
            className="hidden rounded-full border-stone-200 bg-stone-50 px-2.5 py-0.5 text-[11px] text-slate-600 hover:bg-stone-50 sm:inline-flex"
          >
            {subtitle}
          </Badge>
          <p className="text-lg font-semibold text-primary">{price}</p>
          <p className="line-clamp-2 text-sm leading-5 text-slate-900 sm:text-[15px]">
            {title}
          </p>
        </div>
        <div className="flex items-center gap-2 text-sm text-amber-600">
          <div className="flex items-center gap-1">
            {Array.from({ length: 5 }).map((_, index) => (
              <Star
                key={index}
                className={`h-4 w-4 ${
                  index < Math.round(rating) ? 'fill-current text-amber-500' : 'text-stone-300'
                }`}
              />
            ))}
          </div>
          <span className="font-medium text-slate-700">{rating.toFixed(1)}</span>
          <span className="text-slate-500">({reviewCount} reviews)</span>
        </div>
        {userFacingDescription ? (
          <p className="hidden line-clamp-2 text-sm leading-5 text-slate-600 sm:block">
            {userFacingDescription}
          </p>
        ) : null}
        {primaryReason ? (
          <p className="hidden line-clamp-2 text-sm leading-5 text-slate-600 sm:block">
            {primaryReason}
          </p>
        ) : null}
      </CardContent>
      <CardContent className="flex items-center justify-between gap-3 border-t border-stone-100 px-4 py-3 text-sm font-medium text-slate-500">
        <span>Tap for details</span>
        {link ? (
          <a
            href={link}
            target="_blank"
            rel="noreferrer"
            className="relative z-10 inline-flex items-center gap-1 rounded-full border border-stone-200 bg-white px-3 py-1.5 text-sm font-medium text-slate-700 transition hover:border-stone-300 hover:text-slate-900"
            onClick={(event) => {
              event.stopPropagation()
              onRetailerClick?.()
            }}
          >
            View site
            <ChevronRight className="h-4 w-4 text-slate-400" />
          </a>
        ) : (
          <ChevronRight className="h-4 w-4 text-slate-400" />
        )}
      </CardContent>
    </Card>
  )
}

export default ProductCard
