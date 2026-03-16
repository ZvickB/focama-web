import PageShell from '@/components/PageShell.jsx'

function AboutPage() {
  return (
    <PageShell
      eyebrow="About Focama"
      title="A calmer starting point for buying decisions."
      description="Focama is designed to help people slow down, clarify what they need, and shop with more confidence before heading into a marketplace."
    >
      <p>
        The goal of Focama is simple: reduce the noise that usually surrounds online shopping.
        Instead of starting with endless tabs and product listings, the site starts with the
        buying decision itself.
      </p>
      <p>
        The current version focuses on short original buying briefs, sample recommendation
        frameworks, and practical questions that help narrow a search. It is meant to be useful
        before a user clicks into a store.
      </p>
      <p>
        Over time, Focama may expand to include broader guided search tools and affiliate links.
        Any affiliate relationships will be disclosed clearly on the site.
      </p>
    </PageShell>
  )
}

export default AboutPage
