import PageShell from '@/components/PageShell.jsx'
import Seo from '@/components/Seo.jsx'

function AboutPage() {
  return (
    <>
      <Seo
        title="About Focamai"
        description="Learn what Focamai is trying to do: help shoppers slow down, clarify what they need, and get a calmer shortlist before entering a marketplace."
        path="/about"
      />
      <PageShell
        eyebrow="About Focamai"
        title="A calmer starting point for buying decisions."
        description="Focamai is designed to help people slow down, clarify what they need, and shop with more confidence before heading into a marketplace."
      >
        <p>
          The goal of Focamai is simple: reduce the noise that usually surrounds online shopping.
          Instead of starting with endless tabs and product listings, the site starts with the
          buying decision itself.
        </p>
        <p>
          The current version centers on guided product search. You start with a product topic,
          Focamai gathers a candidate set from live product-search data, asks a lightweight follow-up,
          and returns a calmer shortlist before you head into a retailer.
        </p>
        <p>
          The direction is consistent: clearer tradeoffs, less noise, and a more focused path from
          "I need something" to a small set of sensible options. Any affiliate relationships will be
          disclosed clearly on the site.
        </p>
      </PageShell>
    </>
  )
}

export default AboutPage
