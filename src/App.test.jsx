import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { RouteLoadingFallback } from './App.jsx'

describe('RouteLoadingFallback', () => {
  it('shows a visible route loading state', () => {
    render(<RouteLoadingFallback />)

    expect(screen.getByRole('status')).toBeTruthy()
    expect(screen.getByText('Loading Focamai')).toBeTruthy()
    expect(screen.getByText('Getting the next screen ready.')).toBeTruthy()
  })
})
