import PageShell from '@/components/PageShell.jsx'
import Seo from '@/components/Seo.jsx'

function WhyFocamaiPage() {
  return (
    <>
      <Seo
        title="Why Focamai"
        description="See why Focamai exists: to give shoppers a calmer, more focused product shortlist instead of an endless marketplace search spiral."
        path="/why"
      />
      <PageShell bare
        eyebrow="Why Focamai"
        title={<>Find what you need. <span className="whitespace-nowrap">Get on with your day.</span></>}
      >
        <p>
          Most product search is built to keep you searching. Sponsored results, endless
          recommendations, filters that multiply instead of narrow — none of it is designed to get
          you out the door. It&apos;s designed to keep you inside.
        </p>
        <p>
          You feel it even if you&apos;ve never said it out loud. You went in for one thing. Twenty
          minutes later you&apos;re less sure than when you started.
        </p>
        <p>
          Focamai is built on a different assumption: you have something you need, and your time is
          worth something. Describe what you&apos;re looking for. Answer one question. Get a short
          list of picks chosen for your situation — each one with an honest explanation of why it
          made the cut and where it falls short.
        </p>
        <p>That&apos;s the whole experience. Find what you need and move on.</p>
      </PageShell>
    </>
  )
}

export default WhyFocamaiPage
