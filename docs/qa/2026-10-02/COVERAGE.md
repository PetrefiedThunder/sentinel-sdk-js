# Coverage and validation

PR: opened by orchestrator
CI status: pending at time of writing

## Before and after

Measurement: c8 12.0.0 with native V8 coverage on Node 26.7.0; built JavaScript remapped to unchanged TypeScript sources. Both runs use `--all --src dist --include 'dist/**/*.js' --exclude 'dist/generated/**'`, covering all five executable SDK modules, including unimported modules as zero. Generated declarations and the type-only generated re-export module are excluded from executable coverage, not from package inspection. The **line/statement denominator is 967 in both runs**.

| Metric | Before (original 32 tests) | After (110 tests, real LangChain enabled) |
| --- | ---: | ---: |
| Lines | 67.01% (648/967) | 98.65% (954/967) |
| Statements | 67.01% (648/967) | 98.65% (954/967) |
| Branches | 70.65% (65/92) | 86.11% (155/180) |
| Functions | 62.16% (23/37) | 100.00% (41/41) |

Coverage is executed code, not a correctness score: **24 defect assertions execute and fail as expected TODOs** in the after run. Their coverage is included. V8 discovers functions/branches in executed modules; before-import synthetic zero coverage represents each absent module as one function/branch, so function/branch denominators grow after LangChain/Mastra execute. Compare the fixed line denominator for the clean before/after comparison. High percentages do not establish exhaustive framework compatibility or server security.

| Source | Before lines | After lines | After branches |
| --- | ---: | ---: | ---: |
| `src/index.ts` | 82.52% | 98.67% | 90.52% |
| `src/adapters/ai-sdk.ts` | 100.00% | 100.00% | 87.50% |
| `src/adapters/langchain.ts` | 0.00% | 98.47% | 94.11% |
| `src/adapters/mastra.ts` | 0.00% | 100.00% | 54.54% |
| `src/adapters/openai-agents.ts` | 96.66% | 96.66% | 70.83% |

Artifacts: [baseline transcript](artifacts/coord-coverage-baseline-corrected.txt), [baseline JSON summary](artifacts/coverage-before-valid/coverage-summary.json), [final transcript](artifacts/coord-coverage-final.txt), [final JSON summary](artifacts/coverage-final/coverage-summary.json), [full final map](artifacts/coverage-final/coverage-final.json). The first attempted TypeScript include filter excluded instrumented JavaScript before remapping and reported 0%; [that failed measurement](artifacts/coord-coverage-baseline.txt) is retained and **not** used as the baseline.

## Test/build matrix

| Validation | Result | Evidence |
| --- | --- | --- |
| Original build + strict typecheck | Pass | `artifacts/coord-build.txt`, `coord-typecheck.txt` |
| Original tests, Node 18.17.1 / 24.21.0 / 26.7.0 | 32 pass on each; exit 0 | `coord-node18-original.txt`, `coord-node24-original.txt`, `coord-baseline-original.txt` |
| Final build + strict typecheck | Pass | `coord-final-build.txt`, `coord-final-typecheck.txt` |
| Default npm test, Node 26 | 110 tests: 83 pass, 19 TODO, 8 explicit optional-framework skips; exit 0 | `coord-final-default-tests.txt` |
| Final source, Node 26 with real LangChain + coverage | 110 tests: 86 pass, 24 TODO, 0 skips, 0 unexpected failures; exit 0 | `coord-coverage-final.txt` |
| Final source, Node 24.21.0 with real LangChain | 110 tests: 86 pass, 24 TODO, 0 skips, 0 unexpected failures; exit 0 | `coord-final-node24-compatible.txt` |
| Final source, Node 18.17.1 | 110 tests: 83 pass, 27 explicit skips, 0 TODO, 0 unexpected failures; exit 0 | `coord-final-node18-compatible.txt` |
| JS syntax checks | Pass for QA mjs files before compatibility helper; final files also parsed/executed by final test runs | `coord-final-qa-syntax.txt` |
| Strict adapter-consumer types | Positive broad-callback control passes; ordinary/real typed tools reproduce FE-002 | `frontend-consumer-control.txt`, `frontend-consumer-typed.txt`, `frontend-actual-framework-types.txt` |
| Real framework factories, no models/services | AI SDK 7.0.127 / OpenAI Agents 0.18.0 approved/rejected execution controls pass | `frontend-actual-framework-runtime.txt` |
| Clean local Git install | Install succeeds, package import fails: FE-004 | `frontend-shallow-git-consumer.txt`, `frontend-git-consumer-import.txt` |
| Real loopback HTTP | Approval request shape/headers and concurrent allowed/denied callers pass | `backend-core-final-pass.txt` and final combined runs |
| Dependency audit | Development: 34 affected entries (1 upstream critical, 33 high); runtime-only: 0 | `coord-audit.txt`, `coord-audit-runtime.txt` |
| Lint | No lint script/config exists; strict tsc and JS syntax checks used | package.json; PLAN.md |

The first final Node 18 run returned exit 1 despite TAP reporting `fail 0`; a minimal independent control reproduced that version's TODO-exit behavior. The test-only `known-defect.mjs` helper now explicitly skips those 19 active defect cases on Node 18. Together with the eight absent optional-framework cases, that yields 27 skips. The same assertions remain active on Node 24/26 and all 24 fail for their intended reasons. Node 18 also emits MaxListenersExceededWarning from native test-runner TestHook/stopTest internals; the stack was traced in `coord-node18-warning-trace.txt`, and final checks still exit 0. This is retained as a harness limitation, not misreported as an SDK leak.

## Remaining gaps

- Uncovered lines: `src/index.ts:316-317` (non-404 wait error rethrow), `:440-443` (unconfigured module-level client branch), `src/adapters/langchain.ts:129-130` (primitive/array normalization), and `src/adapters/openai-agents.ts:126,132-135` (JSON-string fallback). Additional default/option branches remain, especially Mastra (54.54% branches). Their passing neighbors do not prove those branches.
- No live server authorization/tenant permission matrix, approver token replay, notification delivery, billing, audit-chain verification, durable concurrency or production performance test. Only SDK request handling/auth-header isolation and fail-closed mocked/loopback paths were tested.
- Checked-in OpenAPI-derived declarations have `unknown` response schemas; request shapes were compared offline. No live schema fetch or full response-schema conformance claim.
- No complete LLM agent roundtrip, real Mastra runtime, older framework peer-version matrix, Windows execution or ARM/x64 cross-platform matrix. Explicit script paths avoid depending on shell glob expansion, but Windows was not run.
- No application UI exists: Playwright browser flow, cross-browser, axe/WCAG, keyboard/screen reader, responsive layouts, Lighthouse and screenshots are not applicable. Text/JSON transcripts replace UI artifacts.
- Remote CI, package publication status and the orchestrator draft PR were not queried. CI status remains pending.
