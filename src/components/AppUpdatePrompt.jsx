import { useRegisterSW } from 'virtual:pwa-register/react'

export default function AppUpdatePrompt() {
  const {
    needRefresh: [needRefresh, setNeedRefresh],
    updateServiceWorker,
  } = useRegisterSW({
    onRegisterError(error) {
      console.warn('[PWA] Service worker registration failed', error)
    },
  })

  if (!needRefresh) return null

  return (
    <aside
      aria-live="polite"
      className="fixed inset-x-4 bottom-4 z-[100] mx-auto flex max-w-xl flex-col gap-3 rounded-xl border border-stone-200 bg-white p-4 shadow-xl sm:flex-row sm:items-center sm:justify-between"
      role="status"
    >
      <div>
        <p className="text-sm font-semibold text-stone-900">A Focamai update is ready</p>
        <p className="mt-1 text-sm text-stone-600">Refresh when convenient to use the newest version.</p>
      </div>
      <div className="flex shrink-0 gap-2">
        <button
          className="rounded-md border border-stone-300 bg-white px-3 py-2 text-sm font-medium text-stone-700 transition hover:bg-stone-50 focus:outline-none focus:ring-2 focus:ring-stone-900 focus:ring-offset-2"
          onClick={() => setNeedRefresh(false)}
          type="button"
        >
          Later
        </button>
        <button
          className="rounded-md bg-stone-900 px-3 py-2 text-sm font-medium text-white transition hover:bg-stone-700 focus:outline-none focus:ring-2 focus:ring-stone-900 focus:ring-offset-2"
          onClick={() => void updateServiceWorker(true)}
          type="button"
        >
          Refresh now
        </button>
      </div>
    </aside>
  )
}
