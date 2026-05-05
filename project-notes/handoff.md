# Handoff

## Purpose
- Durable backlog and open product questions.
- `current-status.md` is the short snapshot.
- `app_flow.md` is the implemented flow.

## Current reality
- Frontend is on Vercel; backend is on Render.
- The product path is `rainforest-discover -> refine -> finalize -> enrichment`.
- Retry currently suggests a better next search instead of showing endless same-pool results.
- Discovery cache, search history, analytics, and product-details cache are the main active storage paths.

## Real remaining work
- Verify the live golden path in the browser and confirm cards arrive quickly while modal AI copy hydrates later.
- Audit modal AI tone and tighten any copy that sounds too promotional or vague.
- Improve loading states between search, refine, and results so the transitions feel more intentional.
- Improve low-confidence and weak-result handling instead of quietly showing poor results.
- Review early tester feedback from the new homepage FAB and decide whether the reveal timing, wording, or question set should change.
- Decide whether to add a proactive pool-mismatch nudge before the user opens retry.
- Replace the About page with a `Why Focamai` page, then update nav and add a clear return-home path.
- Decide how retailer clickouts and affiliate disclosures should appear once outbound linking is treated as launch-ready product behavior.
- Keep trimming `backend/server.js` so route orchestration and flow logic do not keep growing in one file.
- Write a few practical analytics read queries or a lightweight internal view for search funnel and cache-health inspection.

## Backend/provider follow-ups
- The current shortlist-detail helper is still Oxylabs-backed. When ready, switch finalize to `fetchRainforestProductDetailsByAsin` without changing the shared product-details cache layer.
- Keep the SerpApi route inactive unless there is a deliberate reason to reactivate multi-retailer discovery.
- Decide whether in-memory Render rate limiting is good enough before broader sharing or whether a stronger trusted-server approach is needed.

## Product guardrails
- Keep the guided flow as the main experience.
- Keep shortlists at 6 unless the user explicitly changes that product decision.
- Keep user-facing saved history separate from internal `search_history`.
- Keep provider-specific implementation details out of the core product identity.

## Later, not now
- Accounts/login only if persistence becomes a real product need.
- Saved searches as an explicit user-facing feature, not by repurposing `search_history`.
- Preference learning only after the core shortlist experience proves useful.
- Subscriber-tier expansion only after the free core flow is solid.
