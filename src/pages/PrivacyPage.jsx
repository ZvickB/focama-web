import PageShell from '@/components/PageShell.jsx'
import Seo from '@/components/Seo.jsx'

const sectionHeadingClassName = 'text-xl font-semibold tracking-tight text-slate-900'
const listClassName = 'list-disc space-y-2 pl-5 marker:text-slate-400'

function PrivacyPage() {
  return (
    <>
      <Seo
        title="Privacy Policy"
        description="Read how Focamai handles account, search, voice, analytics, affiliate, and device data across the website and mobile app."
        path="/privacy"
      />
      <PageShell
        eyebrow="Privacy Policy"
        title="How Focamai handles your information."
        description="This policy applies to the Focamai website and mobile app. It reflects the features currently implemented as of July 2, 2026."
      >
        <section className="space-y-3">
          <h2 className={sectionHeadingClassName}>Information Focamai handles</h2>
          <ul className={listClassName}>
            <li>
              <strong>Search and shopping activity:</strong> product queries, refinement notes,
              retry feedback, selected Amazon marketplace, search results, result impressions and
              clicks, and generated recommendations.
            </li>
            <li>
              <strong>Account information:</strong> email address, Supabase user identifier, and
              authentication/session information. The website also supports optional Google sign-in;
              Google sign-in is not currently available in the mobile app.
            </li>
            <li>
              <strong>Saved searches and price watches:</strong> signed-out search history is stored
              locally on the browser or device. When signed in, saved searches are stored with the
              account. Price watches store the product, Amazon marketplace, price and alert settings,
              and use the account email to send an alert when enabled.
            </li>
            <li>
              <strong>Voice search:</strong> when a mobile user chooses the microphone, Focamai
              records audio after permission is granted and sends it through the Focamai backend to
              OpenAI for transcription. The transcript becomes search text. The backend processes the
              audio in memory and does not save it to Focamai's database; the app creates a temporary
              recording file that is managed by the device operating system.
            </li>
            <li>
              <strong>Feedback and support information:</strong> feedback answers, free-text
              comments, an optional email address, and the search/session context submitted with the
              feedback. Search failures may also produce a support code and diagnostic events.
            </li>
            <li>
              <strong>Technical and usage information:</strong> random search and session
              identifiers, app version or platform, timestamps, performance measurements, error and
              diagnostic details, and result interaction data. Hosting providers receive ordinary
              request information such as IP address and user-agent data. Focamai also derives a
              one-way hashed IP key for backend rate limiting. On the website, Vercel may provide a
              coarse country code from the request to help choose an Amazon marketplace. The mobile
              app does not request precise location or GPS permission; its marketplace is selected
              explicitly by the user.
            </li>
          </ul>
        </section>

        <section className="space-y-3">
          <h2 className={sectionHeadingClassName}>How the information is used</h2>
          <p>Focamai uses this information to:</p>
          <ul className={listClassName}>
            <li>run product discovery, refinement, recommendation, transcription, and Deep Dive features;</li>
            <li>save searches, maintain accounts and sessions, and operate price-watch alerts;</li>
            <li>measure search funnels and result interactions, diagnose failures, prevent abuse, and improve reliability;</li>
            <li>respond to feedback, support, correction, privacy, and account-related requests; and</li>
            <li>maintain the security and performance of the website, app, and backend.</li>
          </ul>
        </section>

        <section className="space-y-3">
          <h2 className={sectionHeadingClassName}>Services that process information</h2>
          <p>
            Focamai sends only the information needed for a feature to the services that provide it:
          </p>
          <ul className={listClassName}>
            <li><strong>Supabase</strong> — authentication, account records, saved searches, price watches, search caches, analytics, diagnostics, feedback, and rate-limit records.</li>
            <li><strong>OpenAI and Anthropic</strong> — AI follow-up questions, query review, shortlist selection, explanations, retry suggestions, and related recommendation processing. OpenAI also transcribes mobile voice searches.</li>
            <li><strong>Rainforest API</strong> — Amazon product search, product details, and price-watch checks.</li>
            <li><strong>SerpApi</strong> — product and retailer evidence when an eligible signed-in user explicitly runs the optional Deep Dive feature.</li>
            <li><strong>Vercel</strong> — website hosting, Web Analytics, and Speed Insights.</li>
            <li><strong>Render</strong> — backend hosting and request logs for website and mobile API traffic.</li>
            <li><strong>Sentry</strong> — backend error monitoring when production monitoring is enabled. Focamai configures its own error context to avoid authorization headers and known secret fields, but error and search context may still be processed when needed to diagnose a failure.</li>
            <li><strong>Resend</strong> — delivery of price-watch email alerts when those alerts are enabled.</li>
            <li><strong>Google</strong> — optional Google authentication and web-font delivery on the website.</li>
            <li><strong>Amazon and product-image hosts</strong> — product images, product pages, and affiliate attribution after a user follows an Amazon link.</li>
          </ul>
          <p>
            The current application code does not sell personal information or use it to serve
            targeted advertising.
          </p>
        </section>

        <section className="space-y-3">
          <h2 className={sectionHeadingClassName}>Local storage, cookies, and analytics</h2>
          <p>
            The website uses browser local storage for signed-out search history, an analytics
            session identifier, Amazon marketplace preferences, backend-route preference, and
            Supabase session persistence. The mobile app uses device storage for signed-out search
            history and marketplace preferences, and secure device storage for the Supabase session.
            Signed-out search history is limited to the 50 most recent entries.
          </p>
          <p>
            Focamai does not currently run a third-party advertising network or add its own
            advertising cookies. Vercel Analytics and Speed Insights process website usage and
            performance events. If you follow a product link, Amazon may use cookies or similar
            technologies on Amazon's service under{' '}
            <a
              href="https://www.amazon.com/gp/help/customer/display.html?nodeId=468496"
              target="_blank"
              rel="noopener noreferrer"
              className="text-primary underline underline-offset-4"
            >
              Amazon's privacy notice
            </a>
            .
          </p>
        </section>

        <section className="space-y-3">
          <h2 className={sectionHeadingClassName}>Affiliate links</h2>
          <p>
            Focamai participates in the Amazon Associates program. Amazon product links contain an
            affiliate tag, and Focamai may earn a commission from a qualifying purchase at no extra
            cost to the user. Affiliate relationships do not change the current recommendation logic,
            which selects products from the available evidence based on the search and refinement
            input rather than commission amount.
          </p>
        </section>

        <section className="space-y-3">
          <h2 className={sectionHeadingClassName}>Retention and deletion</h2>
          <p>
            Search-cache entries are normally marked to expire after 24 hours, although the
            underlying database or hosting records may remain until they are cleaned up. The code
            does not currently define one automatic deletion period for account records, internal
            search logs, analytics, diagnostics, or feedback. Those records may therefore remain
            until deleted as part of maintenance or a valid privacy request. Third-party providers
            may retain information under their own policies.
          </p>
          <p>
            Signed-in users can permanently delete their Focamai account in the mobile app under
            Settings → Account or at <a className="text-primary underline underline-offset-4" href="/delete-account">focamai.com/delete-account</a>.
            This deletes the Supabase authentication user and the account-owned saved searches,
            price watches, and Deep Dive usage record linked to that user ID. The app also clears its
            local saved-search history after a successful deletion. Anonymous operational search
            logs, analytics, diagnostics, caches, rate-limit records, hosting logs, feedback, and
            third-party provider records are not deleted by this control when they cannot be
            reliably linked to the account.
          </p>
        </section>

        <section className="space-y-3">
          <h2 className={sectionHeadingClassName}>Security</h2>
          <p>
            Production traffic uses encrypted HTTPS connections. Mobile authentication sessions are
            kept in secure device storage, and account-owned saved searches and price watches use
            Supabase row-level access controls. Focamai limits server credentials to backend use and
            sanitizes known secret and authorization fields from its configured error context. No
            system can guarantee absolute security.
          </p>
        </section>

        <section className="space-y-3">
          <h2 className={sectionHeadingClassName}>Your choices and rights</h2>
          <ul className={listClassName}>
            <li>Use typed search instead of optional voice search, or deny microphone permission.</li>
            <li>Use search without creating an account.</li>
            <li>Delete or clear user-facing search history and remove price watches in the app or website.</li>
            <li>Control local browser or app data through browser/device settings.</li>
            <li>Contact Focamai to request access, correction, or deletion of personal information, including an account-deletion request. Rights vary by location, and identity may need to be verified before a request is completed.</li>
          </ul>
        </section>

        <section className="space-y-3">
          <h2 className={sectionHeadingClassName}>Contact and policy updates</h2>
          <p>
            For privacy questions or requests, email{' '}
            <a className="text-primary underline underline-offset-4" href="mailto:contact@focamai.com">
              contact@focamai.com
            </a>
            . Focamai may update this policy when its practices or features change and will revise
            the effective date above.
          </p>
        </section>
      </PageShell>
    </>
  )
}

export default PrivacyPage
