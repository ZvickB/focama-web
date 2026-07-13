# Focamai Existing Architecture Audit

I want you to audit the existing Focamai repository and produce a detailed written document explaining how its current technical architecture could be improved.

This is an analysis and documentation task only.

## Do Not Modify the Repository

Do not make any code changes.

Do not create, edit, delete, move, or rename files.

Do not refactor anything.

Do not install packages.

Do not update dependencies.

Do not create commits, branches, pull requests, migrations, scripts, tests, or configuration files.

Do not begin implementing any recommendations.

Your only deliverable is a written architecture audit document.

You may inspect and analyze the repository in depth, but you must stop after producing the document.

---

# Purpose

Focamai already exists and is actively being developed.

I am not asking you to design a completely new architecture from scratch.

I am not asking you to imagine how the product would be built if development started today.

I want you to evaluate the architecture that currently exists and determine how it can be improved incrementally.

Treat this as an architectural review performed by an experienced staff or principal engineer joining an existing project.

The goal is to:

- understand the current architecture
- identify what is already working well
- find concrete structural weaknesses
- identify technical debt and unnecessary complexity
- recommend realistic improvements
- make the existing codebase easier to maintain, test, debug, and extend
- prepare the architecture for likely future growth without overengineering it

The preferred approach is:

> Preserve what works, improve what does not, and avoid rewriting the system unless there is an unusually strong technical justification.

---

# Product Context

Focamai is an AI shopping assistant.

Users describe what they need.

Focamai asks clarification questions when necessary.

It searches available product sources.

It ranks products.

It recommends six products with explanations.

Users can provide feedback to improve the recommendations.

Future premium reports may perform deeper research before recommending products.

Affiliate links generate revenue.

Focamai currently has an existing web application, mobile application, backend services, AI-related logic, product retrieval logic, integrations, and deployment configuration.

Do not redesign the product.

Do not recommend unrelated product features.

Evaluate how well the current repository supports the product that already exists.

---

# Core Instruction

Base every major conclusion on evidence from the actual repository.

Do not provide a generic architecture guide.

Do not recommend patterns merely because they are considered industry best practices.

Do not assume a subsystem is badly designed before examining it.

Do not assume every area needs abstraction, modularization, or replacement.

For every recommendation, explain:

1. What currently exists.
2. Where it exists in the repository.
3. What problem or risk you found.
4. Why the problem matters in practice.
5. What improvement you recommend.
6. Whether the improvement is urgent, useful later, or unnecessary at the current stage.
7. How disruptive the change would be.
8. Whether it can be handled through a small refactor or requires a larger architectural change.

Whenever possible, reference specific:

- folders
- files
- modules
- functions
- components
- services
- data flows
- configuration files
- duplicated implementations
- dependency relationships

Do not invent repository details that you cannot verify.

If something cannot be determined from the repository, state that clearly.

---

# Architectural Philosophy

Prefer evolutionary improvement over replacement.

Favor:

- small, safe refactors
- clearer module boundaries
- reduced duplication
- explicit data flow
- consistent naming
- better separation of concerns
- simpler abstractions
- predictable error handling
- easier testing
- easier debugging
- easier onboarding
- documented architectural decisions

Avoid recommending:

- a full rewrite
- microservices without a demonstrated need
- event-driven architecture without a demonstrated need
- unnecessary queues
- unnecessary distributed infrastructure
- premature optimization
- speculative abstractions
- enterprise patterns that do not match the current scale
- infrastructure designed for traffic the product does not have
- introducing many new libraries when the existing stack can solve the problem
- changing technologies merely because another option is more fashionable

If the current implementation is simple and adequate, say so.

If an architectural concern should wait until the product reaches a certain scale, has multiple retailers, gains significant traffic, or introduces a specific feature, say so explicitly.

---

# Review Process

Begin by understanding the repository before making recommendations.

Map the current system, including where applicable:

- application entry points
- web application structure
- mobile application structure
- backend structure
- shared code
- API boundaries
- data flow
- AI request flow
- search and retrieval flow
- ranking flow
- recommendation generation
- feedback and retry flow
- database access
- authentication
- configuration
- external integrations
- logging and diagnostics
- tests
- deployment
- environment variables
- feature-specific modules

Trace several important end-to-end flows through the real code.

Examples may include:

- a user starting a product search
- clarification-question generation
- retrieval of products
- ranking and selection of six products
- creation of recommendation explanations
- improving previous picks
- affiliate-link generation
- authentication or session handling
- premium-report preparation, if present
- an external retailer or Shopify-related integration, if present

Use these flows to determine whether responsibilities are clearly separated or tightly coupled.

---

# Areas to Review

Review the areas that actually exist in the repository.

Do not force recommendations into every category.

## Repository and Project Structure

Evaluate:

- folder organization
- module boundaries
- separation between product areas
- frontend/backend separation
- web/mobile separation
- shared logic
- naming consistency
- file size
- files with too many responsibilities
- unclear ownership of logic
- circular or fragile dependencies
- dead or obsolete architecture

## Frontend Architecture

Evaluate:

- component responsibilities
- state management
- server-state handling
- API access
- business logic inside UI components
- duplicated web/mobile logic
- hooks
- contexts
- navigation and screen organization
- loading, error, and empty states
- coupling between screens and backend response shapes
- testability

Do not critique visual design or UX unless a technical implementation creates an architectural problem.

## Backend Architecture

Evaluate:

- route structure
- controllers or handlers
- services
- domain logic
- data access
- validation
- error handling
- configuration
- external API integrations
- coupling
- duplicated code
- excessively large modules
- hidden side effects
- ability to test important logic independently

## AI Architecture

Evaluate the existing implementation of:

- prompt construction
- model calls
- provider-specific code
- structured outputs
- parsing
- retries
- timeouts
- fallback behavior
- model selection
- token or cost controls
- logging
- evaluation
- failure handling
- separation between AI decisions and deterministic application logic

Do not recommend building a complex AI platform unless the current code or near-term roadmap justifies it.

Determine whether AI-related responsibilities are:

- centralized appropriately
- scattered across the codebase
- duplicated
- tightly tied to one provider
- difficult to test
- difficult to observe
- difficult to change safely

## Search, Retrieval, and Ranking

Evaluate:

- query creation
- retrieval adapters
- retailer-specific logic
- normalization
- filtering
- ranking
- scoring
- deduplication
- product-selection rules
- explanation generation
- fallback behavior
- coupling between retrieval and presentation
- ability to add another retailer without rewriting the pipeline

Distinguish between:

- problems that exist now
- improvements needed before adding more retailers
- improvements that only matter at much larger scale

## Data Model and Persistence

Evaluate:

- database schema
- table responsibilities
- naming
- relationships
- duplication
- migrations
- access patterns
- persistence of sessions, searches, recommendations, feedback, users, and reports
- whether application logic is overly dependent on raw database shapes
- whether data access is scattered or organized

Do not propose major schema changes unless there is a concrete reason.

## Configuration and Environment Management

Evaluate:

- environment variables
- configuration loading
- validation
- provider-specific settings
- secrets handling
- duplicated configuration
- inconsistent naming
- deployment-specific behavior
- unsafe defaults
- configuration that is difficult to understand or test

## Error Handling and Resilience

Evaluate:

- API errors
- AI provider failures
- retailer failures
- network failures
- parsing failures
- partial results
- timeouts
- retries
- fallback logic
- user-visible failures
- swallowed errors
- inconsistent error shapes

Recommend the simplest improvements that would materially increase reliability.

## Logging, Diagnostics, and Observability

Evaluate:

- what is currently logged
- whether logs are structured
- whether requests can be traced through the search pipeline
- whether AI failures can be diagnosed
- whether retailer failures can be diagnosed
- whether sensitive data is logged
- whether production problems would be understandable from current diagnostics

Do not recommend an expensive observability platform unless justified.

## Testing

Evaluate:

- current test coverage
- what kinds of tests exist
- what critical behavior is untested
- whether modules are difficult to test because of coupling
- brittle tests
- duplicated test setup
- missing integration tests
- missing end-to-end coverage
- whether AI behavior can be tested deterministically
- whether external services are mocked at appropriate boundaries

Prioritize tests that protect core behavior rather than recommending coverage for its own sake.

## Security and Privacy

Evaluate:

- authentication
- authorization
- secret handling
- service-role credentials
- API exposure
- input validation
- rate limiting
- logging of personal data
- prompt injection exposure
- unsafe external content
- database access controls
- mobile/web trust boundaries

Clearly distinguish confirmed issues from possible risks.

## Deployment and Operations

Evaluate:

- build configuration
- deployment configuration
- environment separation
- health checks
- database migrations
- rollback safety
- duplicated deployment services
- stale configurations
- build reproducibility
- production debugging
- differences between local and production behavior

## Documentation

Evaluate:

- README quality
- setup instructions
- architecture documentation
- environment-variable documentation
- deployment documentation
- stale instructions
- missing explanations of important flows
- whether a new developer could understand the system

---

# What to Identify

Identify concrete examples of:

- architectural strengths
- technical debt
- excessive coupling
- duplicated logic
- inconsistent patterns
- misplaced responsibilities
- hidden dependencies
- modules that are too large
- abstractions that are missing
- abstractions that should be removed
- unclear data ownership
- unnecessary complexity
- fragile integrations
- weak error handling
- weak test boundaries
- future bottlenecks
- opportunities to simplify

Do not call something technical debt merely because it is not theoretically ideal.

Explain the practical consequence.

For example:

- What becomes difficult to change?
- What types of bugs become likely?
- What is hard to test?
- What logic is duplicated?
- What future feature would be blocked?
- What production failure would be difficult to diagnose?
- What new developer would struggle to understand?

---

# Recommendation Categories

Classify each recommendation into one of the following categories.

## Keep

The current implementation is sound and should remain largely unchanged.

## Clarify

The implementation is acceptable, but naming, boundaries, comments, or documentation should be improved.

## Small Refactor

A contained improvement that can be made without changing the system design.

## Structural Refactor

A broader reorganization of existing code that preserves behavior but improves module boundaries or data flow.

## Defer

A potentially useful improvement that should not be built yet.

State what future condition would justify it.

## Avoid

A change that may sound attractive but would add more complexity than value at Focamai's current stage.

---

# Priority Levels

Assign each recommendation a priority.

## P0 — Immediate Risk

Use only for issues involving serious security, data-loss, production reliability, or broken architecture.

## P1 — High Value

A meaningful current problem that is likely to cause bugs, slow development, or block near-term work.

## P2 — Worth Improving

A real issue, but not urgent.

## P3 — Future Consideration

Only useful after a clearly stated future milestone.

Do not inflate priorities.

Most recommendations should not be P0 or P1.

---

# Required Deliverable Structure

Produce one detailed Markdown document with the following structure.

## 1. Executive Summary

Summarize:

- the overall health of the architecture
- what is working well
- the most important weaknesses
- whether the repository needs cleanup, targeted refactoring, major restructuring, or none of those
- the five highest-value recommendations

Explicitly state whether a rewrite is warranted.

The default assumption should be that it is not.

## 2. Current Architecture Map

Describe the architecture that actually exists.

Include:

- major applications
- major services
- key folders
- important modules
- external systems
- storage
- deployment targets
- important request and data flows

A Mermaid diagram may be included if it accurately reflects the repository.

Do not create an aspirational diagram in this section.

## 3. End-to-End Flow Analysis

Trace important workflows through the existing code.

For each workflow, explain:

- where it starts
- the important modules involved
- how data moves
- where responsibilities are mixed
- where the architecture is clear
- where failures could occur
- where testing or diagnostics are weak

## 4. Architectural Strengths

Document what should be preserved.

Do not make this section superficial.

Identify decisions that are appropriately simple or well suited to the current product stage.

## 5. Findings by Technical Area

Organize findings by the relevant subjects discovered in the repository.

For every finding include:

- current state
- repository evidence
- assessment
- impact
- recommendation
- category
- priority
- estimated disruption
- whether it should happen now or later

## 6. Duplication and Coupling Report

Identify specific duplicated logic and tightly coupled modules.

Explain whether each case should be:

- left alone
- consolidated
- extracted
- redesigned
- deferred

## 7. Simplification Opportunities

Identify places where code, abstractions, dependencies, or architecture could become simpler.

This section is important.

Do not assume improvement always means adding more layers.

## 8. Future-Readiness Assessment

Assess how naturally the current architecture could support:

- multiple retailers
- premium reports
- deeper diagnostics
- experimentation
- personalization
- multiple AI providers
- international expansion
- additional web/mobile shared behavior

Do not design these features.

Explain only what architectural limitations would need to be addressed before or during their implementation.

## 9. Prioritized Refactoring Plan

Create a practical sequence of improvements.

Use only recommendations already introduced earlier in the document.

Do not add new recommendations in this section.

Organize them into:

### Phase 1 — Low-Risk Cleanup

Small, high-confidence improvements with little behavioral risk.

### Phase 2 — Strengthen Core Boundaries

Refactors that improve separation of concerns and testability.

### Phase 3 — Prepare for Near-Term Product Growth

Changes justified by known upcoming needs.

### Phase 4 — Deferred Until Scale or Complexity Justifies Them

Clearly state the triggering condition for each deferred item.

For each phase explain:

- why the work belongs there
- dependencies
- risks
- expected benefit
- validation criteria
- what should not be changed yet

## 10. Recommended Targeted Documentation

List the small set of architecture documents that should exist after the audit.

Examples:

- repository overview
- search-pipeline flow
- AI-call conventions
- environment-variable reference
- deployment guide
- database overview
- retailer-integration guide

Do not recommend a large documentation bureaucracy.

## 11. Things Not to Do

Based on the repository, explicitly identify tempting changes that would currently create unnecessary complexity.

Examples may include:

- rewriting the backend
- replacing the frontend framework
- splitting into microservices
- introducing a message broker
- creating an elaborate plugin framework
- replacing Supabase
- introducing a large state-management library
- sharing web and mobile code prematurely
- building a full internal AI platform

Only include items relevant to the actual repository.

## 12. Final Recommendation Table

End with a compact table containing:

| Recommendation | Evidence | Category | Priority | Disruption | Timing |
|---|---|---|---|---|---|

Every row must correspond to a recommendation already explained in the document.

---

# Evidence Standards

Use specific repository evidence wherever possible.

Good evidence includes:

- file paths
- module names
- function names
- duplicated code paths
- dependency relationships
- request flow
- database usage
- configuration
- tests
- deployment files

Do not paste large amounts of source code.

Use short excerpts only when needed to prove a point.

Do not state assumptions as facts.

Use labels such as:

- Confirmed from repository
- Likely based on repository evidence
- Cannot be determined from repository alone

---

# Final Constraints

This is an audit of the existing architecture.

It is not a greenfield design.

It is not permission to rebuild Focamai.

It is not permission to change the code.

It is not a feature-planning exercise.

It is not a UX review.

It is not an implementation task.

Do not begin fixing issues after discovering them.

Do not ask whether you should implement the recommendations.

Produce the requested written document and stop.

The final document should help me decide what changes to ask Codex to implement later, one controlled task at a time.