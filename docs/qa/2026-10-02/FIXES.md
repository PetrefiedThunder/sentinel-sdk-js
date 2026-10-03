# QA fix pass — 2026-10-02

Branch: `qa/2026-10-02-fixes`. Baseline: `3ac4ea6`. Final code: `a0edb4c`.
Session uses UTC timestamps on 2026-10-03 (local date 2026-10-02).

Critical/High work order: FE-001 → BE-001 → BE-003 → BE-002 → FE-004, following severity and SUMMARY.md. Optional fixes began after all five had commits and FE-004 passed literal Git-install acceptance. Final review added a second FE-001 commit for a related malformed-ID bypass. Original findings are unchanged.

| Finding ID | Severity | Title | Status | Commit SHA | Proving test (file::name) | Notes or reason deferred |
| --- | --- | --- | --- | --- | --- | --- |
| FE-001 | Critical | LangChain approval bypass / malformed approvals | fixed | ae7ae46, a0edb4c | tests/qa/frontend-langchain.integration.test.mjs::FE-001 real LangChain rejection blocks execution; tests/qa/backend-core.test.mjs::FE-001: malformed creation identifiers cannot authorize core execution | Enable awaited tool callbacks and propagated errors; require explicit matching approvals and valid IDs. Timeout, network, malformed JSON/records, non-2xx, rejected and approved controls pass. No fail-open mode. Pinned real framework is a required dev test dependency. |
| BE-001 | High | Caller mutation changes approved action | fixed | 7e187f2 | tests/qa/backend-core.test.mjs::BE-001: mutation during approval wait must not change the executed intent | Snapshot arguments before callbacks/awaits and execute that same private representation. Positional mutation control also passes. Copied object identity is documented. |
| BE-003 | High | Lossy JSON conversion hides executed arguments | fixed | 765955b | tests/qa/backend-core.test.mjs::BE-003: lossy non-JSON arguments must fail before approval or execution | Reject unsupported values, accessors/toJSON, sparse/custom arrays and nonfinite numbers before network I/O. Copy plain JSON once without invoking hooks; preserve __proto__ as data. Shared-reference and null-prototype controls pass. |
| BE-002 | High | Approval deadline does not bound transport / late execution | fixed | 7484f7d | tests/qa/backend-core.test.mjs::BE-002: a stalled request must settle at the approval deadline; tests/qa/backend-core.test.mjs::BE-002: creation and polling share one wrapper deadline | One wrapper deadline covers creation, response-body reads, wait and fallback; requests receive abort signals and late execution is blocked. Additive optional cancellation signals preserve existing calls. Long-window timer overflow caught and fixed before commit; real LangChain stalled creation/wait tests pass. |
| FE-004 | High | Git install lacks runtime entry points | fixed | 6c1bb3f | tests/qa/frontend-package.test.mjs::FE-004: clean source packaging builds importable runtime and declaration exports | prepare builds dist. Offline clean-source pack/install regression passes. Literal local shallow Git install at this commit succeeded, importing all five public exports and finding all declarations. |
| BE-004 | Medium | Legacy fallback polling has no pacing | fixed | 2b09fad | tests/qa/backend-core.test.mjs::BE-004: legacy fallback polling must be paced | Remember unsupported /wait per call; pending fallback sleeps up to one second, bounded by deadline/cancellation. One-probe and abort controls pass. |
| FE-002 | Medium | Typed framework callbacks are rejected | fixed | 43be828 | tests/qa/frontend-adapters.test.mjs::FE-002 adapters accept explicitly typed callbacks in a strict consumer | Callable method constraints accept concrete types; generic incoming signatures remain intact. Six negative compile controls and real AI SDK/Agents fixtures pass. |
| FE-003 | Medium | Adapters discard idempotencyKey | fixed | 19d77fb | tests/qa/frontend-adapters.test.mjs::FE-003 ai: forwards string idempotency key | All eight normal regressions pass across repeated calls; four generator-error controls block approval/execution. Keys resolve once per invocation, not during wrapping. |
| UX-001 | Medium | Quickstart uses anonymous action name | fixed | cd5ccb2 | tests/qa/ux-docs.test.mjs::UX-001 README quickstart should send a recognizable action name | Explicit functionName and anonymous/minified callback guidance. |
| UX-002 | Medium | Error example silently discards failures | fixed | 640a848 | tests/qa/ux-docs.test.mjs::UX-002 README Errors block should propagate transport failures; tests/qa/ux-docs.test.mjs::UX-002 README Errors block should propagate the approved business operation failure | Rethrow otherwise-unhandled errors; both actual README-code regressions pass. |
| BE-005 | Low | Plain-text HTTP error detail is lost | fixed | d14759a | tests/qa/backend-core.test.mjs::BE-005: plain-text HTTP error retains useful response detail | Read body once, parse JSON from text, retain bounded text fallback; structured/null/long-text controls pass. |
| UX-003 | Low | Contributor version command fails | fixed | 08c3ed9 | tests/qa/ux-docs.test.mjs::UX-003 documented SDK version command should complete successfully | Use the exported VERSION constant with an ESM command, tested directly from CONTRIBUTING. |
| FE-900 | Medium | Release/development dependency advisories | deferred | — | — (dependency audit finding; no executable QA test) | Not a small, clearly safe optional fix: bundled npm/tar/undici release tooling needs a separately validated compatible upgrade. No major upgrade, release config change or advisory override attempted. Fresh registry audit is outside the user-approved install-only network scope. Sweep advisory counts remain historical, not reverified current counts. |

## Counts

| Severity | Fixed | Partial | Deferred |
| --- | ---: | ---: | ---: |
| Critical | 1 | 0 | 0 |
| High | 4 | 0 | 0 |
| Medium | 5 | 0 | 1 |
| Low | 2 | 0 | 0 |
| All findings | 12 | 0 | 1 |

FixCounts: fixed=5 partial=0 deferred=0

The parseable count above includes Critical and High only.

## Full-suite comparison

Every fixed expected-failure/skip assertion is now a normal test. No defect assertion was weakened or removed to pass. Counts below distinguish expected TODO failures from unexpected failures.

| Run | Tests | Pass | Fail (unexpected) | Xfail/TODO | Skip | Exit |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| Sweep original tests, Node 18/24/26 (COVERAGE.md) | 32 | 32 | 0 | 0 | 0 | 0 |
| Sweep default npm test, Node 26 (COVERAGE.md) | 110 | 83 | 0 | 19 | 8 | 0 |
| Sweep with real LangChain, Node 24/26 (COVERAGE.md) | 110 | 86 | 0 | 24 | 0 | 0 |
| Sweep Node 18, framework absent (COVERAGE.md) | 110 | 83 | 0 | 0 | 27 | 0 |
| Fix pass baseline reproduced, Node 26.7.0 + real LangChain | 110 | 86 | 0 | 24 | 0 | 0 |
| Final npm test, Node 26.7.0 | 149 | 149 | 0 | 0 | 0 | 0 |
| Final identical full test list, Node 24.21.0 | 149 | 149 | 0 | 0 | 0 | 0 |
| Final identical full test list, Node 18.17.1 | 149 | 149 | 0 | 0 | 0 | 0 |

Intermediate compatibility probe: Node 18 initially had 133 pass / 14 fail out of 147 because LangChain's callback UUID code expected global WebCrypto. Gate independently reproduced that failure with a generic callback and no Sentinel import, then proved native `node:crypto` WebCrypto resolves it. The test-only bootstrap now uses that native implementation on Node 18; all assertions run, none skip. This is a framework harness prerequisite, not a shipped SDK regression. Other negative-control failures, a transient TypeScript narrowing error and timer-overflow review finding were resolved before their corresponding product commits. No product regression remained and no `git revert` was required.

## Build, types, lint and package verification

- Baseline and final `npm run build`: pass. Baseline and final `npm run typecheck`: pass.
- No lint script/config is supported by this repository, consistent with the sweep. Final `node --check` on all test `.mjs` files and `git diff --check` pass; these are not represented as a lint run.
- Real-framework type fixture: AI SDK 7.0.127 and OpenAI Agents 0.18.0 pass strict NodeNext compilation. Required real LangChain callback tests use 1.2.14.
- FE-004 clean source pack/install regression: pass in default suite. Separate shallow local Git source at `6c1bb3f` contained neither dist nor node_modules; Git installation built the package and all five public runtime/type entries passed. Temporary consumer: `/private/tmp/sentinel-fix-fe004-git-consumer-6c1bb3f/verify.mjs`.
- Gitleaks 8.30.1 default-rule scan of added code diff with redaction: pass, no leaks. No scanner baseline/ignore/config changes.
- Final local gate review at `a0edb4c`: no remaining blocking finding. Command-by-command UTC evidence and all dead ends are in [FIX-SESSION-LOG.md](FIX-SESSION-LOG.md).
- Code coverage percentages were not remeasured. The sweep's 98.65% line figure includes expected-failure execution and is not claimed for this changed source.

## Remaining risks and boundaries

- FE-900 release/development advisories remain deferred. Sweep counts (34 affected entries, zero runtime-only advisories) are historical; no new registry audit was performed, including for the new dev-only LangChain fixture dependency.
- Plain JSON snapshot guarantees apply to `client.wrap` / `oversight`. Framework execution-context objects retain existing identity; this pass does not claim to prevent every framework-side mutation during approval.
- One combined creation/wait deadline is guaranteed by `client.wrap` / `oversight`. Standalone API calls and adapters invoking them separately each have their own local budget. The deadline gates function start, not cancellation of an already-started side effect.
- LangChain 1.2.14 itself targets Node 20+. The Node 18 native WebCrypto test bootstrap verifies SDK compatibility, not upstream framework support for Node 18 or every older peer version.
- No live API/provider/model, approval email, tenant authorization, durable audit or cross-process/exactly-once behavior was exercised. `npm run smoke`, `demo` and live schema generation were not run because they contact real services. These limits were already present in the sweep.
- No push, PR/issue write, merge, rebase, deploy, migration, production call, credential/environment read, billing action or git-config change occurred. Only explicit task files were staged. Package/browser installation was the only external network use; no browser install was needed.
