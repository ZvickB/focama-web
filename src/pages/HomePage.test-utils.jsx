import { afterEach, beforeEach, vi } from 'vitest'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { cleanup, render } from '@testing-library/react'

import SiteLayout from '@/components/SiteLayout.jsx'
import { AmazonStoreProvider } from '@/contexts/AmazonStoreContext.jsx'
import { SearchProgressProvider } from '@/contexts/SearchProgressContext.jsx'
import HomePage from './HomePage.jsx'

export function createMockResult(overrides = {}) {
  return {
    id: 'result-1',
    title: 'Travel stroller',
    subtitle: 'Target',
    price: '$129.99',
    rating: 4.4,
    reviewCount: 87,
    description: 'Lightweight and easy to fold.',
    fit_reason: 'Lightweight and easy to fold — well suited for travel.',
    caveat: 'Pricier than the smallest umbrella stroller options.',
    image: 'https://example.com/stroller.jpg',
    link: 'https://example.com/stroller',
    ...overrides,
  }
}

export function renderHomePage() {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: {
        retry: false,
      },
      mutations: {
        retry: false,
      },
    },
  })

  return render(
    <MemoryRouter initialEntries={['/']}>
      <QueryClientProvider client={queryClient}>
        <AmazonStoreProvider>
          <SearchProgressProvider>
            <Routes>
              <Route element={<SiteLayout />}>
                <Route path="/" element={<HomePage />} />
              </Route>
            </Routes>
          </SearchProgressProvider>
        </AmazonStoreProvider>
      </QueryClientProvider>
    </MemoryRouter>,
  )
}

export function setupHomePageTest() {
  beforeEach(() => {
    vi.restoreAllMocks()
    window.localStorage.clear()
    delete document.documentElement.dataset.bgMode
    window.__FOCAMAI_DISABLE_ENRICHMENT_POLLING__ = true
    window.__FOCAMAI_DISABLE_QUERY_QUALITY_POLLING__ = true
    window.__FOCAMAI_DISABLE_GEO_FETCH__ = true
  })

  afterEach(() => {
    delete window.__FOCAMAI_DISABLE_ENRICHMENT_POLLING__
    delete window.__FOCAMAI_DISABLE_QUERY_QUALITY_POLLING__
    delete window.__FOCAMAI_DISABLE_GEO_FETCH__
    vi.useRealTimers()
    cleanup()
  })
}
