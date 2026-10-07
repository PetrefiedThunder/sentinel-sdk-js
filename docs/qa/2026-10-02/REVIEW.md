# Independent review of QA evidence

PR: opened by orchestrator
CI status: pending at time of writing

This is a review of the three QA passes, not a fourth QA group. It checks the evidence, test safety and change scope independently. Review started at approximately 2026-10-03T01:44:30Z. Checkout identity was confirmed as `717392b`, branch `qa/2026-10-02-sweep`, repository `PetrefiedThunder/sentinel-sdk-js`.

## Executable evidence

At 2026-10-03T01:45:18Z the independent reviewer ran the four new QA test files with the installed real `@langchain/core` dependency. Result: **78 tests, 54 pass, 24 TODO, zero unexpected failures, zero skipped, exit 0**. Every TODO failed at the intended assertion; none failed because of missing imports, tool setup or network access. See [independent test output](artifacts/review-independent-qa.txt).

After the deterministic polling test and Node 18 compatibility changes, the reviewer reran the final `npm test` command with real LangChain at 2026-10-03T01:51:06Z: **110 tests, 86 pass, 24 TODO, zero unexpected failures, zero skipped, exit 0**. See [final independent run](artifacts/review-final-test-command.txt). Coordinator evidence separately confirms Node 24.21.0 with the same totals, and Node 18.17.1 with **83 pass, 27 explicit skips, zero failures, exit 0** ([Node 24](artifacts/coord-final-node24-compatible.txt), [Node 18](artifacts/coord-final-node18-compatible.txt)). Node 18 skips include known defects plus the unavailable optional framework integration; they are not counted as passing reproductions.

The real LangChain tests independently establish both defects in FE-001: default callback flags omit the approval request, and enabling the callback alone leaves rejection/timeout errors swallowed. Controls setting both `ignoreAgent: false` and `raiseError: true` block rejected/timed-out tool execution and allow one approved execution. Critical severity is supported for an approval-gating SDK.

BE-001, BE-002 and BE-003 are distinct and supported High findings: mutable arguments differ from reviewed data; a stalled request exceeds its deadline and a late approval runs the operation; lossy serialization hides argument data while executing the original values. BE-004 reproduced 44 requests within its approximately 100 ms window. BE-005 reproduced an empty `[502] ` error despite a useful text response.

FE-002 fails on TS2322 for ordinary typed callbacks in three adapters while the strict NodeNext export-resolution control passes. FE-003 reproduces omitted literal and generated idempotency keys across all four adapters. The README examples reproduce UX-001/002/003 at their intended assertions.

FE-004 is supported as a **Git-install** failure: README.md:13-18 prescribes Git installation, a clean local shallow clone at the same HEAD installs successfully as a Git dependency, and importing its public package name fails because `dist/index.js` is absent. The first attempt against the partial checkout hit a promisor-object error; it was retained as a dead end and replaced by the successful local shallow-source installation. Evidence: [successful local Git installation](artifacts/frontend-shallow-git-consumer.txt), [public-package import failure](artifacts/frontend-git-consumer-import.txt). This does not assert that a published npm artifact is broken.

UX-001's suggested explicit action name (or named function expression) is valid: JavaScript does not infer the outer variable's name for an inline arrow passed to `oversight`. Its Medium severity reflects poor approval context, without claiming a bypass. UX-002's `else { throw e; }` suggestion preserves the example's intentional branches and exposes unhandled transport/business errors; Medium is proportionate. The existing VERSION export is a tested workaround for Low-severity UX-003.

FE-900 is appropriately scoped as Medium for the release/development dependency tree. The public-registry audit's upstream severity counts must remain distinct from repository finding counts, and runtime audit zero must remain visible. The report does not claim exploitation or a shipped runtime vulnerability.

## QA change review

- No product source or deployment files were modified at the first scope checkpoint. Tests use synthetic inputs and local stubs; the single real HTTP test asserts that its target is an ephemeral loopback origin before forwarding to native fetch.
- Each test file runs in its own Node test process. Fetch and clock patches are restored within the backend file; no concurrent tests within that file were enabled.
- The optional real LangChain dependency is outside the product dependency tree. Its tests skip explicitly when unavailable, so ordinary consumers do not acquire that dependency.
- The new tests use Node APIs available at the declared Node 18.17 minimum; actual runtime compatibility is recorded by the coordinator's runtime checks, not inferred from this inspection alone.
- Do not describe clean-source `npm pack` evidence as proof of a broken published npm package. The checked-in publish workflow builds explicitly, and `prepublishOnly` builds during `npm publish`.
- BE-004's initial timing-sensitive probe was replaced during review with a fixed-clock, bounded microtask probe. It records six requests before any timer turn and terminates through a scripted approved response. The original 44-request timing result is retained as historical evidence, while the final test avoids host-load-dependent request counts.

## Corrections requested during review

1. **Resolved:** preserve the original package description text; changing the em dash to a JSON escape was an unrelated serialization side effect. Final package diff retains the original text.
2. **Resolved:** keep the expanded `npm test` command portable to Node 18 on Windows. Shell globs expand on Unix but not `cmd.exe`; the final script now lists explicit test filenames.
3. **Resolved:** Node 18.17.1 reports failing TODOs as zero failures in its TAP footer but exits 1. An isolated one-test control independently reproduced this test-runner behavior ([control output](artifacts/review-node18-todo-exit-control.txt)). The `known-defect.mjs` test helper now explicitly skips known defects on Node versions below 20 while preserving executed TODO reproductions on Node 24/26. The compatible Node 18 rerun exits 0. This is QA harness compatibility, not a new SDK finding.

## Final gate

At 2026-10-03T01:52:46Z, the consolidated FINDINGS, COVERAGE and SUMMARY documents were checked against reports and raw artifacts. The finding table contains **13 unique findings: Critical=1, High=4, Medium=6, Low=2**, grouped as Backend=5, Frontend=5 and UX=3. Summary counts match. All Markdown evidence links in the available QA documents resolve. Final source/test line references were read back after the compatibility imports; their cited assertions and code locations are correct. The coverage JSON independently matches 648/967 lines before and 954/967 after, with the changed branch/function denominators explained.

The final tracked diff is only the package test-command extension; all remaining changes are QA tests, fixtures, logs and documentation. Private non-repository instruction bodies and private search terms were omitted from publishable artifacts with explicit omission records; this did not remove test or finding evidence. No credential exposure finding was introduced by this scope cleanup.

**Gate result: no unresolved correctness or scope blocker in the reviewed QA diff.** Original product defects remain documented and unfixed. The coordinator will aggregate SESSION-LOG after reviewer freeze; this final log aggregation and orchestrator PR/CI actions are not claimed as already completed by this review.

## Review limits

No credentials, environment files, production endpoints, remote databases or billing systems were inspected. CodeRabbit was not run because its remote review API is outside the orchestrator's public-package-only network allowance; local `review-pr` and `code-review` guidance informed this review. Published package retrieval, full version matrices of external frameworks, remote CI and the eventual draft PR are outside this review's evidence.
