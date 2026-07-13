I want you to act as a senior AI product designer, UX researcher, recommendation-system expert, and consumer shopping expert.

This document is NOT about implementation planning.

This document is NOT about software architecture.

This document is NOT about code organization.

This document is NOT about database design.

Its only purpose is to make Focamai produce dramatically better user experiences and better shopping recommendations.

Assume implementation complexity is temporarily irrelevant.

Think only about making the product as good as it can possibly become.

---

# What Focamai does

Focamai helps shoppers discover the right product much faster than traditional shopping.

Instead of browsing hundreds of products, the user explains what they need.

Focamai asks intelligent follow-up questions when necessary.

It searches, ranks, and recommends six products with explanations.

Users can then improve the results by giving feedback, and Focamai refines the search automatically.

The goal is not simply to answer questions.

The goal is to help people make confident buying decisions.

---

# Your priorities (in order)

## Priority 1 — Better Results

This is the most important section.

Critique every part of the recommendation pipeline.

Think deeply about:

- understanding user intent
- clarification questions
- query generation
- retrieval quality
- filtering
- ranking
- diversity of recommendations
- duplicate avoidance
- confidence estimation
- uncertainty handling
- explanations
- handling conflicting requirements
- sparse product information
- poor retailer data
- affiliate considerations
- "Improve these picks"
- premium research reports
- trustworthiness

Suggest ways to make recommendations substantially better.

Do not focus on implementation.

Focus on recommendation quality.

---

## Priority 2 — UX

Review the entire customer journey.

Everything from:

- first launch
- onboarding
- entering a request
- clarification questions
- waiting states
- loading
- results
- comparing products
- improving results
- premium reports
- affiliate links
- empty states
- errors
- confidence
- delight
- premium feeling

Identify friction.

Identify confusion.

Identify opportunities.

Suggest improvements.

---

## Priority 3 — Reliability and Trust

Review everything that affects user confidence.

Examples include:

- hallucinations
- stale information
- uncertainty
- missing information
- regional product differences
- affiliate correctness
- shipping estimates
- pricing
- transparency
- safety
- confidence communication

Suggest ways to make users trust Focamai more.

---

## Priority 4 — Diagnostics and Product Intelligence

Design a world-class diagnostic system.

I do NOT simply want more logs.

I want diagnostics that tell me WHY searches succeed or fail.

For every stage of the search pipeline describe:

- what should be measured
- what should be logged
- what healthy behaviour looks like
- common failure modes
- how to recognize them
- what action I should take when I see them

Design dashboards and admin tools that would help me improve Focamai over time.

Suggest metrics.

Suggest evaluation datasets.

Suggest A/B testing ideas.

Suggest quality scoring systems.

Suggest ways to continuously improve recommendation quality.

---

## Priority 5 — Features

Only after the previous sections are complete...

Suggest additional features.

Separate them into:

- Must Have
- High Value
- Nice To Have
- Future Ideas

Do NOT invent features simply because they sound interesting.

Every feature must solve a real user problem.

---

# Output Format

Organize the document into TWO completely separate parts.

# PART 1 — Logical Organization

Group everything by subject.

For example:

- Search Quality
- Recommendation Engine
- UX
- Trust
- Diagnostics
- Features

This should become the permanent reference document.

---

# PART 2 — Improvement Roadmap

Take exactly the same recommendations from Part 1.

Do NOT add new ideas.

Do NOT remove ideas.

Simply reorganize them into implementation phases.

Example:

Now

Validate

Next

Validate

Later

Future

For every phase explain:

- why it belongs there
- expected impact
- validation criteria before moving to the next phase

---

# Important Rules

Do NOT redesign the architecture.

Do NOT discuss databases.

Do NOT discuss APIs.

Do NOT discuss code organization.

Do NOT discuss implementation details.

Do NOT discuss engineering unless it directly affects recommendation quality or user experience.

Focus entirely on making Focamai a dramatically better shopping assistant.

I would rather receive 30 outstanding recommendations than 300 mediocre ones.

Depth is far more valuable than quantity.