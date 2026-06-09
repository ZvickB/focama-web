import PageShell from '@/components/PageShell.jsx'
import Seo from '@/components/Seo.jsx'

function PrivacyPage() {
  return (
    <>
      <Seo
        title="Privacy Policy"
        description="Read how Focamai currently handles search inputs, analytics, affiliate tracking, and third-party services across the site and app."
        path="/privacy"
      />
      <PageShell
        eyebrow="Privacy Policy"
        title="How information is handled by Focamai."
        description="This is a simple privacy policy for the current version of Focamai and can be updated as the site and app add more features."
      >
        <p>
          Focamai currently lets users enter product topics and optional refinement notes to
          generate shopping shortlists. That information is used to operate the guided search flow,
          help refine the final shortlist, and improve the reliability of the experience.
        </p>
        <p>
          Focamai also uses basic analytics and hosting logs, including Vercel Analytics on the web
          experience, to understand traffic, diagnose issues, and improve performance. Search
          requests may also pass through third-party services that power product search, AI
          refinement, and storage for the app. Depending on the environment, cache and search-history
          storage may use either Supabase-backed storage or a local development fallback.
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
          Focamai is adding optional user accounts for features such as saved searches. Search stays
          available without an account, and Focamai does not ask users to submit payment information
          through the site or app.
        </p>
      </PageShell>
    </>
  )
}

export default PrivacyPage
