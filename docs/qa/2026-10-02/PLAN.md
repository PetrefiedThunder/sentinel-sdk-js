# QA plan — Sentinel JavaScript SDK — 2026-10-02

PR: opened by orchestrator
CI status: pending at time of writing

## Scope and controls

Worktree: `/Users/sellers/Projects/qa-sweep-2026-10-02/sentinel-sdk-js`; branch: `qa/2026-10-02-sweep`; starting commit: `717392b`. Remote identity: `PetrefiedThunder/sentinel-sdk-js`. Initial working tree clean. This is a Node.js/TypeScript SDK, not RegEngine and not a web app. No local repository AGENTS.md was found. The ancestor `/Users/sellers/AGENTS.md` contains stale RegEngine guidance; current session instructions govern this SDK task.

Only tests, QA test configuration and documentation will change. No product fixes, commits, pushes, PR API calls, deployments, environment files, credentials, remote services or databases. Network is restricted to public dependency/package metadata installation. Tests use synthetic data and mocked fetch or loopback servers. The logging runner passes only basic process variables to commands and does not forward service credentials. No live smoke/demo or schema-refresh commands will run.

UTC timestamps fall on October 3 while the requested Los Angeles QA date is October 2. Every pass has a separate log; SESSION-LOG.md indexes and consolidates commands, failures, charters and edits. Artifacts are text/JSON reports. UI screenshots would misrepresent an SDK and are not applicable.

## Repository map

| Area | Surface | Main risk |
| --- | --- | --- |
| `src/index.ts` | Client, approval wrapper, polling, global configuration, pagination, audit requests | Unapproved or duplicate execution; wrong client; hangs; transport errors |
| `src/adapters/{ai-sdk,openai-agents,langchain,mastra}.ts` | Four framework integrations | Approval bypass, changed tool arguments, broken package interoperability |
| `src/generated/api.d.ts`, `src/generated/index.ts` | Checked-in OpenAPI-derived contracts | Drift between hand-written wire shapes and checked-in contract |
| `tests/*.mjs` | Node built-in unit tests; separate live smoke | Gaps in negative paths, adapter coverage and execution safety |
| `package.json`, `tsconfig.json`, lockfile | ESM exports, declarations, package contents, Node compatibility | Consumers cannot install, import or compile |
| `README.md`, `CONTRIBUTING.md`, `examples/demo.mjs` | Installation, quickstart, examples, API discoverability | Copied examples fail, unsafe assumptions, unclear recovery |
| `.github/workflows/` | Existing verification configuration (read only) | New QA checks not exercised by existing CI |

## Risk ranking

Impact and likelihood use 1–5 scales; score is impact × likelihood. Ranking is initial and will be revised only with evidence.

| Rank | Risk | Impact | Likelihood | Score |
| --- | --- | ---: | ---: | ---: |
| 1 | Wrapped action executes without the exact approved intent or more than once | 5 | 4 | 20 |
| 2 | Polling/HTTP timeout, failure or malformed response leaves work hanging or unsafe | 5 | 4 | 20 |
| 3 | Framework adapter changes/bypasses approval or tool behavior | 5 | 3 | 15 |
| 4 | Credentials/client context leak across concurrent requests or reconfiguration | 5 | 3 | 15 |
| 5 | Published exports/types/examples fail in supported consumers | 4 | 3 | 12 |
| 6 | Serialization, query boundaries or contract drift misrepresent requests | 4 | 3 | 12 |
| 7 | Error messages and docs prevent diagnosis or misstate safety guarantees | 3 | 3 | 9 |
| 8 | Dependency supply chain and accidental sensitive package content | 4 | 2 | 8 |

## Three passes and methods

1. **Backend QA → SDK core transport and safety.** Establish the unmodified suite with V8 coverage, build and strict typecheck. Use boundary/equivalence cases, deterministic seeded generated cases, auth-header/client-isolation matrices, idempotency/concurrency probes, error and cancellation probes, and offline checks against the checked-in schema. Review OWASP API risks at the SDK boundary; server authorization cannot be established here. These methods target the highest-impact fail-closed behavior with reproducible fast tests rather than production integration.
2. **Frontend QA → package and framework consumer integration.** There is no DOM/UI. Verify the npm artifact, ESM exports/declarations, supported Node assumptions and adapter behavior with stubbed tools; build/typecheck and isolated consumer smoke tests replace application build and browser E2E. Cross-browser, Lighthouse, console/network UI checks and screenshots are not applicable. Use dependency audit via public npm metadata. A frontend lint command will be checked for availability; no speculative lint policy will be added.
3. **UX QA → developer experience.** Walk through README install/quickstart/API examples, discoverability, error recovery and async states using local stubs; assess Nielsen heuristics adapted to an SDK (feedback, consistency, control, prevention, recovery, documentation). WCAG/axe, keyboard/screen reader, responsive layouts and screenshot requirements do not apply without UI. Retain executable transcript evidence instead.

Each pass has one or more 15–20 minute exploratory charters with UTC start/end and outcomes. Passes may run concurrently as independent workstreams, with distinct logs and file ownership. Baseline coverage is captured before new QA tests. The test pyramid is primarily unit/negative-path tests, a smaller set of real loopback HTTP/package integration tests, and no live production end-to-end tests. Bugs are documented and retained as expected-failure/TODO tests keyed to finding IDs; product behavior stays unchanged. Tests must never contact the SDK's production default URL.

## Acceptance and exclusions

All five mandatory documents, separate pass logs and reproducible artifacts exist; baseline and final coverage use the same source denominator; added tests pass or are explicit expected failures; a fresh independent review checks findings, test isolation and scope. Findings include exact reproduction, expected/actual, evidence and fixes. Default suites remain green. PR/remote CI is owned by the orchestrator and pending at writing. No full framework service, live API schema freshness, server-side auth matrix, delivery channels, production billing, browser app or performance/load infrastructure is in scope.
