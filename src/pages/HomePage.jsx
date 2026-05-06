import Seo from '@/components/Seo.jsx'
import { HomeExperience } from '@/components/home/HomeExperience.jsx'

function HomePage() {
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
      <HomeExperience />
    </>
  )
}

export default HomePage
