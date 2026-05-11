import logo from '@/assets/logo_master_version.svg'

function SkeletonBlock({ className }) {
  return (
    <div className={`relative overflow-hidden rounded-full bg-[#eadfd2]/80 ${className}`}>
      <div className="absolute inset-y-0 left-0 w-1/2 -translate-x-full bg-gradient-to-r from-transparent via-white/75 to-transparent animate-shimmer" />
    </div>
  )
}

export function ResultSkeleton({ className = '' }) {
  return (
    <div
      className={`h-full overflow-hidden rounded-[24px] border border-[#eadfce] bg-[linear-gradient(180deg,rgba(255,255,255,0.98),rgba(251,247,242,0.95))] shadow-[0_24px_80px_-50px_rgba(120,87,63,0.28)] sm:rounded-[28px] ${className}`}
    >
      <div className="relative h-44 overflow-hidden bg-[linear-gradient(180deg,rgba(243,236,228,0.92),rgba(248,244,239,0.82))] sm:h-56">
        <img
          src={logo}
          alt=""
          aria-hidden="true"
          className="absolute left-1/2 top-1/2 h-20 w-20 -translate-x-1/2 -translate-y-1/2 object-contain opacity-[0.14] sm:h-24 sm:w-24"
        />
        <div className="absolute inset-y-0 left-0 w-1/2 -translate-x-full bg-gradient-to-r from-transparent via-white/75 to-transparent animate-shimmer" />
      </div>
      <div className="space-y-4 p-5 sm:p-6">
        <SkeletonBlock className="h-5 w-24" />
        <SkeletonBlock className="h-7 w-3/4" />
        <SkeletonBlock className="h-4 w-1/2" />
        <div className="space-y-2 pt-2">
          <SkeletonBlock className="h-4 w-full" />
          <SkeletonBlock className="h-4 w-full" />
          <SkeletonBlock className="h-4 w-2/3" />
        </div>
        <div className="relative overflow-hidden rounded-2xl bg-stone-200/80">
          <div className="h-11 w-full" />
          <div className="absolute inset-y-0 left-0 w-1/2 -translate-x-full bg-gradient-to-r from-transparent via-white/75 to-transparent animate-shimmer" />
        </div>
      </div>
    </div>
  )
}

export default ResultSkeleton
