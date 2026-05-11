import { afterEach, describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import ErrorBoundary from './ErrorBoundary.jsx'

function Bomb({ error }) {
  throw error
}

describe('ErrorBoundary', () => {
  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('renders the fallback UI when a child throws', () => {
    vi.spyOn(console, 'error').mockImplementation(() => {})

    render(
      <ErrorBoundary>
        <Bomb error={new Error('test crash')} />
      </ErrorBoundary>,
    )

    expect(screen.getByText('Something went wrong.')).toBeTruthy()
    expect(screen.getByText('Reload page')).toBeTruthy()
    expect(screen.getByText('Go home')).toBeTruthy()
  })

  it('uses more helpful copy for route chunk load failures', () => {
    vi.spyOn(console, 'error').mockImplementation(() => {})

    render(
      <ErrorBoundary>
        <Bomb error={new TypeError('Failed to fetch dynamically imported module')} />
      </ErrorBoundary>,
    )

    expect(screen.getByText('We had trouble loading this part of Focamai.')).toBeTruthy()
    expect(screen.getByText(/Reloading usually pulls in the newest app files/i)).toBeTruthy()
  })
})
