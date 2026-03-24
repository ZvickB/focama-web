import PageShell from '@/components/PageShell.jsx'

function PrivacyPage() {
  return (
    <PageShell
      eyebrow="Privacy Policy"
      title="How information is handled on this site."
      description="This is a simple privacy policy for the current version of Focama and can be updated as the site adds more features."
    >
      <p>
        Focama currently lets visitors enter product topics and optional refinement notes to
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
        Focama does not currently offer user accounts, and it does not ask users to submit payment
        information through the site.
      </p>
      <p>
        Before broader launch, this policy should be reviewed and expanded to describe providers,
        retention, and affiliate-related data handling more specifically if those parts of the
        product become more user-facing.
      </p>
    </PageShell>
  )
}

export default PrivacyPage
