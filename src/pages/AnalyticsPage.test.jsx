import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { cleanup, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import AnalyticsPage from './AnalyticsPage.jsx'

const ACTIVITY_LAYOUT_STORAGE_KEY = 'focamai:activity-dashboard-layout:v1'

function renderPage() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  })

  return render(
    <QueryClientProvider client={queryClient}>
      <AnalyticsPage />
    </QueryClientProvider>,
  )
}

describe('AnalyticsPage Activity dashboard', () => {
  afterEach(() => {
    cleanup()
    vi.unstubAllGlobals()
  })

  beforeEach(() => {
    window.localStorage.clear()
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        activity: {
          errors: { count: 0, recent: [] },
          possibleConfusion: { improvePicksToday: 0, recent: [] },
          recentJourneys: [],
          recentSearches: [],
          retailerActivity: { clickoutsToday: 0, recent: [], searchesToday: 0 },
          usersToday: { accounts: 0, devices: 0, searches: 0 },
        },
      }),
    }))
  })

  it('opens on Activity with each placeholder widget visible', () => {
    renderPage()

    expect(screen.getByRole('tab', { name: 'Activity' })).toHaveAttribute('aria-selected', 'true')
    expect(screen.getByRole('heading', { name: 'Users Today' })).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'Recent User Journeys' })).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'Recent Searches' })).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'Retailer Activity' })).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'Possible Confusion' })).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'Errors' })).toBeInTheDocument()
  })

  it('persists visibility and widget order, then restores defaults', async () => {
    const user = userEvent.setup()
    renderPage()

    await user.click(screen.getByRole('button', { name: 'Customize Dashboard' }))
    await user.click(screen.getByRole('checkbox', { name: 'Users Today' }))
    await user.click(screen.getByRole('button', { name: 'Move Recent Searches up' }))

    expect(screen.queryByRole('heading', { name: 'Users Today' })).not.toBeInTheDocument()

    await waitFor(() => {
      expect(JSON.parse(window.localStorage.getItem(ACTIVITY_LAYOUT_STORAGE_KEY))).toEqual([
        { id: 'users-today', visible: false },
        { id: 'recent-searches', visible: true },
        { id: 'recent-journeys', visible: true },
        { id: 'retailer-activity', visible: true },
        { id: 'possible-confusion', visible: true },
        { id: 'errors', visible: true },
      ])
    })

    await user.click(screen.getByRole('button', { name: 'Restore defaults' }))

    expect(screen.getByRole('heading', { name: 'Users Today' })).toBeInTheDocument()
    await waitFor(() => {
      expect(JSON.parse(window.localStorage.getItem(ACTIVITY_LAYOUT_STORAGE_KEY))).toEqual([
        { id: 'users-today', visible: true },
        { id: 'recent-journeys', visible: true },
        { id: 'recent-searches', visible: true },
        { id: 'retailer-activity', visible: true },
        { id: 'possible-confusion', visible: true },
        { id: 'errors', visible: true },
      ])
    })
  })
})
