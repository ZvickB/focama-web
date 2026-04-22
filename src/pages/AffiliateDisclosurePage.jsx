import PageShell from '@/components/PageShell.jsx'

function AffiliateDisclosurePage() {
  return (
    <PageShell
      eyebrow="Affiliate Disclosure"
      title="How affiliate links work on this site."
      description="Focamai participates in the Amazon Associates program. This page explains what that means for you."
    >
      <p>
        Focamai is a participant in the Amazon Services LLC Associates Program, an affiliate
        advertising program designed to provide a means for sites to earn advertising fees by
        advertising and linking to Amazon.com.
      </p>
      <p>
        When you click a product link on Focamai and make a purchase on Amazon, Focamai may earn a
        small commission at no extra cost to you. This is how the site is supported.
      </p>
      <p>
        Affiliate relationships do not influence which products are recommended. Picks are selected
        by the AI based on your search and refinement input — not by commission potential or
        advertiser relationships.
      </p>
      <span className="block rounded-2xl border border-amber-200/80 bg-amber-50/90 px-4 py-3 text-slate-800">
        As an Amazon Associate I earn from qualifying purchases.
      </span>
    </PageShell>
  )
}

export default AffiliateDisclosurePage
