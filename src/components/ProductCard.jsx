import { ChevronRight, Star } from 'lucide-react'
import { Badge } from '@/components/ui/badge.jsx'
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from '@/components/ui/card.jsx'

function ProductCard({
  description,
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
      className="group h-full overflow-hidden rounded-[24px] border-stone-200/80 bg-white/90 shadow-[0_24px_80px_-48px_rgba(15,23,42,0.45)] backdrop-blur transition hover:-translate-y-1 sm:rounded-[28px]"
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
      <div className="relative overflow-hidden">
        <img
          className="h-44 w-full object-cover transition duration-500 group-hover:scale-105 sm:h-56"
          src={image}
          alt={title}
          loading="lazy"
          decoding="async"
        />
        <Badge className="absolute left-4 top-4 rounded-full bg-white/92 px-3 py-1 text-slate-800 hover:bg-white/92">
          {subtitle}
        </Badge>
      </div>
      <CardHeader className="space-y-3 p-5 sm:space-y-4 sm:p-6">
        <div className="flex items-start justify-between gap-3">
          <CardTitle className="line-clamp-2 text-base leading-6 text-slate-900 sm:text-xl sm:leading-7">
            {title}
          </CardTitle>
          <p className="whitespace-nowrap text-lg font-semibold text-primary sm:text-xl">{price}</p>
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
      </CardHeader>
      <CardContent className="px-5 pb-0 sm:px-6">
        <p className="line-clamp-2 text-sm leading-6 text-slate-600 sm:line-clamp-none">
          {description}
        </p>
      </CardContent>
      <CardContent className="flex items-center justify-between p-5 pt-4 text-sm font-medium text-slate-500 sm:p-6 sm:pt-4">
        <span>Tap for details</span>
        <ChevronRight className="h-4 w-4 text-slate-400" />
      </CardContent>
    </Card>
  )
}

export default ProductCard
