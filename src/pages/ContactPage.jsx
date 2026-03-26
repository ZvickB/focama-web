import PageShell from '@/components/PageShell.jsx'

function ContactPage() {
  return (
    <PageShell
      eyebrow="Contact"
      title="Questions, feedback, or corrections."
      description="If you want to get in touch about the site, content, or future partnership questions, this page is the starting point."
    >
      <p>
        Contact email: <a className="text-primary underline underline-offset-4" href="mailto:hello@focamai.com">hello@focamai.com</a>
      </p>
      <p>
        This address is intended for general questions, feedback about site content, and
        correction requests if something on the site needs updating.
      </p>
      <p>
        If you plan to replace this with a real inbox later, that is completely fine. For now, the
        important part is that the site has a visible and legitimate contact method.
      </p>
    </PageShell>
  )
}

export default ContactPage
