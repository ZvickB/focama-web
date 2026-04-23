import PageShell from '@/components/PageShell.jsx'

function PrivacyPage() {
  return (
    <PageShell
      eyebrow="Privacy Policy"
      title="How information is handled on this site."
      description="This is a simple privacy policy for the current version of Focamai and can be updated as the site adds more features."
    >
      <p>
        Focamai currently lets visitors enter product topics and optional refinement notes to
        generate shopping shortlists. That information is used to operate the guided search flow,
        help refine the final shortlist, and improve the reliability of the experience.
      </p>
      <p>
        The site also uses basic analytics and hosting logs, including Vercel Analytics, to
        understand traffic, diagnose issues, and improve performance. Search requests may also pass
        through third-party services that power product search, AI refinement, and storage for the
        app. Depending on the environment, cache and search-history storage may use either
        Supabase-backed storage or a local development fallback.
      </p>
      <p>
        Focamai participates in the Amazon Associates affiliate program. When you follow a product
        link to Amazon, Amazon may set cookies on your device to attribute any resulting purchase
        for commission purposes. This is standard affiliate tracking and is covered by{' '}
        <a
          href="https://www.amazon.com/gp/help/customer/display.html?nodeId=468496"
          target="_blank"
          rel="noopener noreferrer"
          className="text-primary underline underline-offset-4"
        >
          Amazon's own privacy policy
        </a>
        .
      </p>
      <p>
        Focamai does not currently offer user accounts, and it does not ask users to submit payment
        information through the site.
      </p>
    </PageShell>
  )
}

export default PrivacyPage
