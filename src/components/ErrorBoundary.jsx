import { Component } from 'react'

function isChunkLoadError(error) {
  const message = error instanceof Error ? error.message : String(error || '')
  const name = error instanceof Error ? error.name : ''

  return (
    name === 'ChunkLoadError' ||
    /chunk/i.test(message) ||
    /dynamically imported module/i.test(message) ||
    /failed to fetch/i.test(message)
  )
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
        ? 'This can happen after an update or a spotty connection. Reloading usually pulls in the newest app files.'
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
