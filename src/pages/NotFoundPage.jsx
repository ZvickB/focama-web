import { Link } from 'react-router-dom'
import PageShell from '@/components/PageShell.jsx'
import Seo from '@/components/Seo.jsx'

function NotFoundPage() {
  return (
    <>
      <Seo
        title="Page Not Found"
        description="The page you were looking for does not exist on Focamai."
        path="/404"
        noindex
      />
      <PageShell
        eyebrow="Page Not Found"
        title="That page does not exist."
        description="The link may be outdated, or the page may have moved while the site is still taking shape."
      >
        <p>
          If you were looking for a trust page, you can use the navigation above or head back to the
          homepage.
        </p>
        <div>
          <Link
            to="/"
            className="inline-flex rounded-full bg-primary px-5 py-3 text-sm font-medium text-primary-foreground shadow-[0_18px_40px_-22px_rgba(15,23,42,0.55)] transition hover:bg-primary/90"
          >
            Return Home
          </Link>
        </div>
      </PageShell>
    </>
  )
}

export default NotFoundPage
