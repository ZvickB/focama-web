import { Search, Sparkles } from 'lucide-react'
import { Button } from '@/components/ui/button.jsx'
import { Input } from '@/components/ui/input.jsx'
import { Label } from '@/components/ui/label.jsx'
import { Textarea as UITextarea } from '@/components/ui/textarea.jsx'

function Textarea({
  audience,
  disabled = false,
  onAudienceChange,
  onDetailsChange,
  onSubmit,
  productQuery,
}) {
  return (
    <form className="space-y-4 sm:space-y-5" onSubmit={onSubmit}>
      <div className="space-y-2">
        <Label htmlFor="product-query" className="text-slate-700">
          Product topic
        </Label>
        <Input
          id="product-query"
          value={productQuery}
          onChange={(event) => onAudienceChange(event.target.value)}
          placeholder='Example: "lego", "chair", or "stroller"'
          className="h-12 rounded-2xl border-stone-200 bg-white/90 px-4 text-base placeholder:text-slate-400"
          disabled={disabled}
        />
      </div>

      <div className="space-y-2">
        <Label htmlFor="direction-notes" className="text-slate-700">
          Buying context
        </Label>
        <UITextarea
          id="direction-notes"
          className="min-h-28 rounded-3xl border-stone-200 bg-white/90 px-4 py-3 text-base placeholder:text-slate-400 sm:min-h-32"
          placeholder='Example: "For a 9 year old who loves imagination and building stories."'
          value={audience}
          onChange={(event) => onDetailsChange(event.target.value)}
          disabled={disabled}
        />
      </div>

      <Button
        type="submit"
        disabled={disabled}
        className="h-12 w-full gap-2 rounded-2xl bg-primary text-base text-primary-foreground hover:bg-primary/90"
      >
        {disabled ? 'Finding picks...' : 'Get product picks'}
        {disabled ? <Sparkles className="h-4 w-4 animate-pulse" /> : <Search className="h-4 w-4" />}
      </Button>
    </form>
  )
}

export default Textarea
