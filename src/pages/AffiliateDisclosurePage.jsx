import PageShell from '@/components/PageShell.jsx'

function AffiliateDisclosurePage() {
  return (
    <PageShell
      eyebrow="Affiliate Disclosure"
      title="Current disclosure status."
      description="This page explains how affiliate relationships are handled on Focama at the current stage of the project."
    >
      <p>
        Focama can already send users to retailer product pages from recommendation results. Those
        outbound links are part of the current product experience even while the monetization model
        is still evolving.
      </p>
      <p>
        In the future, Focama may participate in affiliate programs, including Amazon Associates.
        If and when affiliate links are activated, the site will provide clear disclosures so users
        understand that Focama may earn a commission from qualifying purchases.
      </p>
      <p>
        Once Amazon Associates is active on the site, this page and any relevant page-level
        disclosures should be updated to include the required Amazon statement:
        <span className="block rounded-2xl border border-amber-200/80 bg-amber-50/90 px-4 py-3 text-slate-800">
          As an Amazon Associate I earn from qualifying purchases.
        </span>
      </p>
    </PageShell>
  )
}

export default AffiliateDisclosurePage
