import PageShell from '@/components/PageShell.jsx'
import Seo from '@/components/Seo.jsx'

function ContactPage() {
  return (
    <>
      <Seo
        title="Contact"
        description="Contact Focamai for questions, feedback, partnership conversations, or corrections about the site and its product guidance."
        path="/contact"
      />
      <PageShell
        eyebrow="Contact"
        title="Questions, feedback, or corrections."
        description="If you want to get in touch about the site, content, or future partnership questions, this page is the starting point."
      >
        <p>
          Contact email: <a className="text-primary underline underline-offset-4" href="mailto:contact@focamai.com">contact@focamai.com</a>
        </p>
        <p>
          This address is intended for general questions, feedback about site content, and
          correction requests if something on the site needs updating.
        </p>
      </PageShell>
    </>
  )
}

export default ContactPage
