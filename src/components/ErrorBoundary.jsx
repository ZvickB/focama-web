import { Component } from 'react'

const CHUNK_RELOAD_KEY = 'focamai_chunk_reload_attempted_at'
const CHUNK_RELOAD_COOLDOWN_MS = 60_000

function isChunkLoadError(error) {
  const message = error instanceof Error ? error.message : String(error || '')
  const name = error instanceof Error ? error.name : ''

  return (
    name === 'ChunkLoadError' ||
    /loading (?:css )?chunk [\d-]+ failed/i.test(message) ||
    /dynamically imported module/i.test(message) ||
    /importing a module script failed/i.test(message)
  )
}

function shouldAutomaticallyReload(error) {
  if (!isChunkLoadError(error)) return false

  try {
    const lastAttempt = Number(window.sessionStorage.getItem(CHUNK_RELOAD_KEY) || 0)
    if (Date.now() - lastAttempt < CHUNK_RELOAD_COOLDOWN_MS) return false
    window.sessionStorage.setItem(CHUNK_RELOAD_KEY, String(Date.now()))
  } catch {
    // Without a durable loop guard, keep the manual recovery screen.
    return false
  }

  return true
}

export default class ErrorBoundary extends Component {
  constructor(props) {
    super(props)
    this.state = { error: null, hasError: false }
  }

  static getDerivedStateFromError(error) {
    return { error, hasError: true }
  }

  componentDidCatch(error, errorInfo) {
    console.error('[ErrorBoundary] Unhandled UI error', error, errorInfo)

    if (shouldAutomaticallyReload(error)) {
      window.location.reload()
    }
  }

  handleReload = () => {
    window.location.reload()
  }

  handleGoHome = () => {
    window.location.assign('/')
  }

  render() {
    if (this.state.hasError) {
      const chunkLoadFailed = isChunkLoadError(this.state.error)
      const title = chunkLoadFailed
        ? 'We had trouble loading this part of Focamai.'
        : 'Something went wrong.'
      const description = chunkLoadFailed
        ? 'Focamai could not finish applying an update. Reload the page to pull in the newest app files.'
        : 'Reload the page to restart the app. If that does not work, head back home and start fresh.'

      return (
        <div className="flex min-h-screen flex-col items-center justify-center bg-white px-6 py-12 text-center text-stone-900">
          <div className="w-full max-w-md space-y-5">
            <div className="space-y-2">
              <p className="text-lg font-semibold">{title}</p>
              <p className="text-sm leading-6 text-stone-600">{description}</p>
            </div>
            <div className="flex flex-col justify-center gap-3 sm:flex-row">
              <button
                className="rounded-md bg-stone-900 px-4 py-2.5 text-sm font-medium text-white transition hover:bg-stone-700 focus:outline-none focus:ring-2 focus:ring-stone-900 focus:ring-offset-2"
                onClick={this.handleReload}
                type="button"
              >
                Reload page
              </button>
              <button
                className="rounded-md border border-stone-300 bg-white px-4 py-2.5 text-sm font-medium text-stone-800 transition hover:bg-stone-50 focus:outline-none focus:ring-2 focus:ring-stone-900 focus:ring-offset-2"
                onClick={this.handleGoHome}
                type="button"
              >
                Go home
              </button>
            </div>
          </div>
        </div>
      )
    }

    return this.props.children
  }
}
