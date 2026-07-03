import { lazy, Suspense, useEffect, useState } from 'react'
import { useLocation } from 'react-router-dom'
import Seo from '@/components/Seo.jsx'
import { HomeShell } from '@/components/home/HomeShell.jsx'
import { getBackendUrl, probeDirectBackend } from '@/lib/backendUrl.js'
import { preconnectToUrl, scheduleIdleTask } from '@/lib/resourceHints.js'
import { readFlowSnapshot } from '@/lib/search/searchFlowSnapshot.js'

function loadHomeExperience() {
  return import('@/components/home/HomeExperience.jsx').then((module) => ({
    default: module.HomeExperience,
  }))
}

const HomeExperience = lazy(() =>
  loadHomeExperience(),
)

function HomePage() {
  const location = useLocation()
  const historySearch = location.state?.historySearch
  const historySearchQuery = String(historySearch?.query || '').trim()
  const historySearchFollowUp = String(historySearch?.followUp || '').trim()
  const [initialSearchQuery, setInitialSearchQuery] = useState(historySearchQuery)
  const [initialSearchFollowUp, setInitialSearchFollowUp] = useState(historySearchFollowUp)
  const [hasRestorableFlowSnapshot] = useState(() => Boolean(readFlowSnapshot()))
  const hasStartedSearch = Boolean(initialSearchQuery) || hasRestorableFlowSnapshot

  useEffect(() => {
    preconnectToUrl(getBackendUrl())
    void probeDirectBackend()
  }, [])

  useEffect(() => {
    if (hasStartedSearch) {
      return undefined
    }

    return scheduleIdleTask(() => {
      void loadHomeExperience()
    })
  }, [hasStartedSearch])

  function handleSearchStart(query) {
    setInitialSearchFollowUp('')
    setInitialSearchQuery(query)
  }

  return (
    <>
      <Seo
        title="Focamai — fewer, better picks"
        description="Describe what you need, answer one short follow-up, and get six focused product picks without getting lost in a marketplace."
        path="/"
        jsonLd={[
          {
            '@context': 'https://schema.org',
            '@type': 'WebSite',
            name: 'Focamai',
            url: 'https://focamai.com/',
            description:
              'Focamai helps shoppers describe what they need and get a short, calm set of product picks before heading to a marketplace.',
          },
          {
            '@context': 'https://schema.org',
            '@type': 'Organization',
            name: 'Focamai',
            url: 'https://focamai.com/',
            logo: 'https://focamai.com/icon-512.png',
          },
        ]}
      />
      {hasStartedSearch ? (
        <Suspense
          fallback={
            <HomeShell
              initialQuery={initialSearchQuery}
              isStarting
            />
          }
        >
          <HomeExperience
            initialSearchFollowUp={initialSearchFollowUp}
            initialSearchQuery={initialSearchQuery}
          />
        </Suspense>
      ) : (
        <HomeShell onSearchStart={handleSearchStart} />
      )}
    </>
  )
}

export default HomePage
