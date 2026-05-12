import { useState } from 'react'
import { CheckCircle2, Home, Share, Smartphone } from 'lucide-react'
import { Link } from 'react-router-dom'
import Seo from '@/components/Seo.jsx'
import { usePWAInstall } from '@/hooks/usePWAInstall.js'

function InstallPage() {
  const { canInstall, install, isInstalled, platform } = usePWAInstall()
  const [installOutcome, setInstallOutcome] = useState(null)

  async function handleInstall() {
    const choice = await install()
    setInstallOutcome(choice?.outcome || 'prompted')
  }

  return (
    <>
      <Seo
        title="Add to Home Screen"
        description="Add Focamai to your phone home screen for mobile testing."
        path="/install"
      />
      <main className="px-4 py-6 sm:px-6 lg:px-8">
        <section className="mx-auto w-full max-w-lg rounded-[24px] border border-stone-200/80 bg-white/90 p-6 shadow-[0_24px_80px_-52px_rgba(15,23,42,0.35)] sm:p-8">
          <div className="space-y-3">
            <div className="inline-flex h-11 w-11 items-center justify-center rounded-full bg-primary/10 text-primary">
              <Smartphone className="h-5 w-5" />
            </div>
            <div className="space-y-2">
              <h1 className="text-2xl font-semibold tracking-tight text-slate-900">
                Add to Home Screen
              </h1>
              <p className="text-sm leading-6 text-slate-600">
                Use these quick steps to install Focamai as a home screen app on a test phone.
              </p>
            </div>
          </div>

          <div className="mt-7 space-y-5 text-sm leading-6 text-slate-700">
            {isInstalled ? (
              <div className="space-y-4">
                <div className="flex items-start gap-3 rounded-2xl border border-emerald-100 bg-emerald-50 px-4 py-3 text-emerald-900">
                  <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0" />
                  <p>Focamai is already installed on this device.</p>
                </div>
                <Link
                  to="/"
                  className="inline-flex items-center gap-2 rounded-full bg-slate-900 px-4 py-2.5 text-sm font-medium text-white transition hover:bg-slate-800"
                >
                  <Home className="h-4 w-4" />
                  Back to Home
                </Link>
              </div>
            ) : platform === 'android' && (canInstall || installOutcome) ? (
              <div className="space-y-4">
                {canInstall && !installOutcome ? (
                  <button
                    type="button"
                    onClick={handleInstall}
                    className="inline-flex w-full items-center justify-center gap-2 rounded-full bg-primary px-4 py-3 text-sm font-semibold text-white shadow-[0_18px_40px_-24px_rgba(15,97,117,0.75)] transition hover:bg-primary/90"
                  >
                    <Smartphone className="h-4 w-4" />
                    Add to Home Screen
                  </button>
                ) : null}
                {installOutcome === 'accepted' || installOutcome === 'prompted' ? (
                  <p className="rounded-2xl border border-emerald-100 bg-emerald-50 px-4 py-3 text-emerald-900">
                    Check your home screen!
                  </p>
                ) : null}
                {installOutcome === 'dismissed' ? (
                  <p className="rounded-2xl border border-amber-100 bg-amber-50 px-4 py-3 text-amber-900">
                    The install prompt was closed. You can still use the browser menu to add the app.
                  </p>
                ) : null}
                <p className="text-xs leading-5 text-slate-500">
                  If the button does not appear, tap the browser menu (...) and choose
                  "Add to Home Screen".
                </p>
              </div>
            ) : platform === 'ios' ? (
              <div className="space-y-4">
                <ol className="space-y-3">
                  <li className="flex gap-3">
                    <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-slate-100 text-xs font-semibold text-slate-700">
                      1
                    </span>
                    <span>
                      Tap the Share button{' '}
                      <Share className="mx-0.5 inline h-4 w-4 align-[-2px]" />
                      at the bottom of Safari.
                    </span>
                  </li>
                  <li className="flex gap-3">
                    <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-slate-100 text-xs font-semibold text-slate-700">
                      2
                    </span>
                    <span>Scroll down and tap "Add to Home Screen".</span>
                  </li>
                  <li className="flex gap-3">
                    <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-slate-100 text-xs font-semibold text-slate-700">
                      3
                    </span>
                    <span>Tap "Add" in the top-right corner.</span>
                  </li>
                </ol>
                <p className="rounded-2xl border border-amber-100 bg-amber-50 px-4 py-3 text-xs leading-5 text-amber-900">
                  These steps only work in Safari. If you are using Chrome or Firefox on iOS,
                  open this page in Safari first.
                </p>
              </div>
            ) : (
              <p>
                On Android, open this page in Chrome and look for the install prompt. On iPhone or
                iPad, open this page in Safari and use Share - Add to Home Screen.
              </p>
            )}
          </div>
        </section>
      </main>
    </>
  )
}

export default InstallPage
