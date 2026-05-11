import { lazy, Suspense, useState } from 'react'
import Seo from '@/components/Seo.jsx'
import { HomeShell } from '@/components/home/HomeShell.jsx'

const HomeExperience = lazy(() =>
  import('@/components/home/HomeExperience.jsx').then((module) => ({
    default: module.HomeExperience,
  })),
)

function HomePage() {
  const [initialSearchQuery, setInitialSearchQuery] = useState('')
  const hasStartedSearch = Boolean(initialSearchQuery)

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
          <HomeExperience initialSearchQuery={initialSearchQuery} />
        </Suspense>
      ) : (
        <HomeShell onSearchStart={setInitialSearchQuery} />
      )}
    </>
  )
}

export default HomePage
