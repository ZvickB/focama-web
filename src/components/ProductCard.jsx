import { ChevronRight, Star } from 'lucide-react'
import { Badge } from '@/components/ui/badge.jsx'
import {
  Card,
  CardContent,
} from '@/components/ui/card.jsx'

function ProductCard({
  description,
  drawbacks = [],
  image,
  onSelect,
  price,
  rating,
  reviewCount,
  subtitle,
  title,
}) {
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
      <div className="overflow-hidden border-b border-stone-100 bg-stone-50">
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
            className="rounded-full border-stone-200 bg-stone-50 px-2.5 py-0.5 text-[11px] text-slate-600 hover:bg-stone-50"
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
        <p className="line-clamp-2 text-sm leading-5 text-slate-600">
          {description}
        </p>
        {drawbacks[0] ? (
          <p className="line-clamp-2 text-sm leading-5 text-slate-500">
            <span className="font-medium text-slate-700">Tradeoff:</span> {drawbacks[0]}
          </p>
        ) : null}
      </CardContent>
      <CardContent className="flex items-center justify-between border-t border-stone-100 px-4 py-3 text-sm font-medium text-slate-500">
        <span>Tap for details</span>
        <ChevronRight className="h-4 w-4 text-slate-400" />
      </CardContent>
    </Card>
  )
}

export default ProductCard
