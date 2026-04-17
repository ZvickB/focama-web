import { describe, expect, it } from 'vitest'
import { render, screen } from '@testing-library/react'
import ErrorBoundary from './ErrorBoundary.jsx'

function Bomb() {
  throw new Error('test crash')
}

describe('ErrorBoundary', () => {
  it('renders the fallback UI when a child throws', () => {
    const consoleError = console.error
    console.error = () => {}

    render(
      <ErrorBoundary>
        <Bomb />
      </ErrorBoundary>,
    )

    expect(screen.getByText('Something went wrong.')).toBeTruthy()
    console.error = consoleError
  })
})
