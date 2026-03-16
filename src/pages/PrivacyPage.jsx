import PageShell from '@/components/PageShell.jsx'

function PrivacyPage() {
  return (
    <PageShell
      eyebrow="Privacy Policy"
      title="How information is handled on this site."
      description="This is a simple privacy policy for the current version of Focama and can be updated as the site adds more features."
    >
      <p>
        Focama currently provides buying-guidance content and may collect information that users
        choose to enter into on-site forms or fields. That information is used only to operate and
        improve the experience of the site.
      </p>
      <p>
        Like most websites, Focama may also use basic analytics, hosting logs, or similar technical
        tools to understand traffic, diagnose issues, and improve performance. Those tools may
        collect information such as browser type, device information, referring pages, or general
        usage patterns.
      </p>
      <p>
        Focama does not currently offer user accounts, and it does not ask users to submit payment
        information through the site.
      </p>
      <p>
        If the site later adds analytics tools, email collection, affiliate integrations, or other
        features that materially change data handling, this privacy policy should be updated to
        reflect those changes.
      </p>
    </PageShell>
  )
}

export default PrivacyPage
