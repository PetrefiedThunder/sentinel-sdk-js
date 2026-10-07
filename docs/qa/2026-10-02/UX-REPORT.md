# UX QA report — developer experience

PR: opened by orchestrator
CI status: pending at time of writing

This repository has no application UI. The UX pass therefore reviewed the experience of integrating the SDK: installation guidance, approval feedback, public API usage, unexpected failures, and bug reporting. Browser, axe/WCAG, keyboard, screen-reader, mobile/responsive, and screenshot checks are not applicable. Executable transcripts are the evidence artifact.

## Result

Three findings: **Medium=2, Low=1**. No product changes. The final isolated command `node --test tests/qa/ux-docs.test.mjs` completed with **10 tests: 6 passing, 0 failures, 4 TODO expected failures**. Four expected-failure assertions cover three findings because UX-002 affects both transport errors and errors from the approved business operation.

Evidence: [final test transcript](artifacts/ux-final-docs-regressions.txt), [initial test transcript](artifacts/ux-first-docs-regressions.txt), [source inspection](artifacts/ux-docs-and-client.txt), [README line references](artifacts/ux-readme-lines-and-existing-tests.txt), and [separate pass log](UX-LOG.md).

## Findings

| ID | Severity | Group | Title | Exact reproduction | Expected vs actual | Evidence | Suggested fix |
| --- | --- | --- | --- | --- | --- | --- | --- |
| UX-001 | Medium | UX / developer experience | README quickstart labels its payment action `anonymous` | After a local build, run `node --test --test-name-pattern='UX-001' tests/qa/ux-docs.test.mjs`. The test extracts the actual README quickstart, substitutes synthetic configuration and a payment stub, and captures the approval request with a fetch stub. | Expected: an approver can identify the example operation as `wireTransfer`. Actual: `function_name` is `anonymous`, because an inline arrow passed as an argument has no inferred name. This removes the operation label from the approval request; it does not itself bypass approval. | `README.md:35-42`; fallback in `src/index.ts:389`; test `UX-001 README quickstart should send a recognizable action name` at `tests/qa/ux-docs.test.mjs:132`; transcript shows `anonymous` vs `wireTransfer`. | Add `functionName: 'wireTransfer'` to the example options, or use a named function expression. Document the same requirement for anonymous callbacks/minified code. The passing explicit-action-name test verifies the existing option works. |
| UX-002 | Medium | UX / developer experience | README error handling silently discards network and business-operation failures | Run `node --test --test-name-pattern='UX-002' tests/qa/ux-docs.test.mjs`. One probe makes fetch throw a synthetic `TypeError`; the other returns approval and then makes the wrapped payment operation throw a synthetic `Error`. Both execute the actual README Errors block. | Expected: an error not intentionally handled by the three documented branches propagates to the caller or is explicitly reported. Actual: the catch falls through without logging or rethrowing; its surrounding async operation resolves successfully despite the failed operation. | `README.md:91-101`; test cases at `tests/qa/ux-docs.test.mjs:139` and `:152`; transcript shows `Missing expected rejection` for both. | End the example with an `else { throw e; }` fallback. Explain that underlying tool/payment failures and native transport errors also propagate through a wrapped call. |
| UX-003 | Low | UX / developer experience | Contributor version-reporting command fails | Run the documented command from the checkout or an installed consumer: `node -e "console.log(require('sentinel-oversight/package.json').version)"`. Offline reproduction is retained by `node --test --test-name-pattern='UX-003' tests/qa/ux-docs.test.mjs`. | Expected: prints the SDK version requested for a bug report. Actual: exits 1 with `ERR_PACKAGE_PATH_NOT_EXPORTED`, because `./package.json` is absent from package exports. | `CONTRIBUTING.md:26`; `package.json:8-29`; test at `tests/qa/ux-docs.test.mjs:164`; transcript includes the exact exception. | Document the already-supported public export: `node --input-type=module -e "import { VERSION } from 'sentinel-oversight'; console.log(VERSION)"`. A passing subprocess test confirms this workaround. |

## Adapted Nielsen heuristics

| Heuristic | Assessment and evidence |
| --- | --- |
| Visibility of system status | Approval wait is a pending Promise. The quickstart test holds the decision response and verifies that the payment stub has not run, then releases approval. No live email/dashboard status was asserted. |
| Match between system and user language | UX-001: the quickstart's recognizable business operation becomes `anonymous` on the wire. Risk-level terminology and rejection reasons otherwise carry through. |
| User control and freedom | Rejection prevents the callback; documented timeout handling is exercised with the actual error class. Cancellation, retry races, and timeout enforcement belong to the backend pass. |
| Consistency and standards | Examples use `configure`/`oversight` consistently; page properties use the documented camelCase mapping. Sync functions are accepted but wrappers return Promises, verified by a passing case. |
| Error prevention | Missing API configuration produces an actionable local `SentinelConfigError`. No API key is obtained or required for this pass. |
| Recognition rather than recall | UX-001 removes the visible business operation label. The existing `functionName` option provides an immediate workaround without a product change. |
| Flexibility and efficiency | Both the global convenience API and explicit client wrapper are exercised. Parameter forwarding and the returned value are verified without framework services. |
| Minimalist presentation | README is short enough to navigate; no cosmetic defect was raised. Its payment example assumes an externally initialized `stripe` client, so the execution harness supplies a synthetic equivalent. |
| Error diagnosis and recovery | UX-002 loses unexpected failures; UX-003 blocks the prescribed bug-report command. Documented rejection, timeout, and HTTP error branches produce messages in the passing tests. Loss of non-JSON HTTP detail is owned by the backend pass, not duplicated here. |
| Help and documentation | README and contributor instructions were inspected against implementation. Git installation/package contents are owned by frontend QA. External links, publication status, server notification behavior, and server audit guarantees were not contacted or verified. |

## Method and limits

The quickstart and Errors examples are read from README at test runtime and transpiled using the repository's existing TypeScript dependency. Imports are supplied from the built local SDK. The harness replaces the environment object with a synthetic value, adds a loopback API base URL, intercepts every fetch, and replaces the payment client with a local stub. No HTTP request leaves the process. The contributor command runs in a subprocess against the local package self-reference.

Approval success and rejection exercise the full local wrapper. Timeout messaging uses an injected `ApprovalTimeout` to test the documented catch branch; it is **not** proof of timeout enforcement. Core timeout behavior, transport coverage, contract/security behavior and browser/framework compatibility are reported by their respective passes. Coverage totals are consolidated in COVERAGE.md; this pass does not claim independent coverage numbers.

The exploratory charter had a 20-minute maximum and ended early after the focused walkthrough and reproducible findings were complete. Actual UTC bounds and all commands are in UX-LOG.md. A minor demo stdout timing concern was considered and excluded from findings to prioritize the more consequential, executable defects above.

## Final runner compatibility note

Known-defect assertions execute as TODOs on Node 20+ and were verified failing for the intended reasons on Node 24/26. Node 18.17 treats failing TODOs as a nonzero process exit even with `fail 0`; `tests/qa/known-defect.mjs` therefore marks those cases explicitly skipped on Node 18, with their finding IDs. Passing controls still execute. This is a QA harness adjustment, not a product fix. See the consolidated runtime matrix in COVERAGE.md.
