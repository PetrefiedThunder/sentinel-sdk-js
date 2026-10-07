# Backend QA — SDK core transport and approval safety

PR: opened by orchestrator
CI status: pending at time of writing

The SDK core has three High, one Medium and one Low finding. No product code changed. Thirty added core tests finish with **24 pass, 0 fail, 6 TODO**; all six TODOs actually fail their intended safety assertion and correspond to five findings. The separate loopback test passes using an ephemeral `127.0.0.1` HTTP server and synthetic authorization values. No production service, real credential, external database or billing system was contacted.

## Findings

The repository must first be built with `npm run build`. Each reproduction below runs from the repository root; TODO tests intentionally exit successfully while preserving assertion evidence. The complete verification command is `node --test tests/qa/backend-core.test.mjs`. See [final pass output](artifacts/backend-core-final-pass.txt) and [source/test line inventory](artifacts/backend-final-source-lines.txt).

| ID | Severity | Group | Title | Exact reproduction | Expected | Actual | Evidence | Suggested fix |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| BE-001 | High | Backend | Caller mutation changes the action after approval creation | Run `node --test --test-name-pattern='BE-001:' tests/qa/backend-core.test.mjs`. The test starts a wrapped call with nested transfer amount `1`/recipient `qa-reviewed`, blocks the decision response, changes that same object's amount to `999`/recipient `qa-changed`, then returns approved. | Execute only the reviewed payload, or reject if the payload changed. | Approval creation sends the first values; the protected function receives the changed values. | `src/index.ts:400`, `src/index.ts:407`, `src/index.ts:425`; test `BE-001: mutation during approval wait must not change the executed intent` at `tests/qa/backend-core.test.mjs:193`; assertion diff in final output. | Capture a supported immutable argument snapshot before sending approval, and use that exact snapshot for execution; alternatively reject changed arguments before any side effect. Define compatibility for non-JSON objects explicitly. |
| BE-002 | High | Backend | Approval deadline neither bounds network wait nor blocks late execution | Run `node --test --test-name-pattern='BE-002:' tests/qa/backend-core.test.mjs`. One test advances the clock two seconds during a one-second decision wait and returns approved. The second leaves mocked fetch unresolved, waits 80 ms for a 10 ms local timeout, then releases the mock for cleanup. | Timeout with `ApprovalTimeout`; do not execute after the allowed local window. | The late response executes once. The stalled request remains pending past its deadline. | `src/index.ts:193`, `src/index.ts:300`, `src/index.ts:320`; tests at `tests/qa/backend-core.test.mjs:214` and `:228`; final output shows `1 !== 0` and `still-pending` instead of `timeout`. | Enforce a single deadline across creation/polling, pass an abort signal to each fetch, and check expiry before accepting a terminal response or executing the function. Avoid relying solely on the server's wait query. |
| BE-003 | High | Backend | Lossy JSON conversion permits execution with unreviewed arguments | Run `node --test --test-name-pattern='BE-003:' tests/qa/backend-core.test.mjs`. Submit objects containing NaN, Infinity, undefined, a Set, a Map, or a function and return approved. | Reject unsupported values before network I/O/execution, or execute the exact supported JSON representation submitted for review. | All six inputs execute. NaN/Infinity become null, undefined/functions disappear, and Set/Map become empty objects in the reviewed JSON. | `src/index.ts:118`, `src/index.ts:228`, `src/index.ts:234`, `src/index.ts:425`; test at `tests/qa/backend-core.test.mjs:242`; six accepted cases in final output. | Validate plain JSON values recursively (finite numbers, supported primitives, arrays and plain objects), reject unsupported/lossy values, and align serialization with the immutable snapshot used for execution. |
| BE-004 | Medium | Backend | Legacy-server fallback polls continuously without pacing | Run `node --test --test-name-pattern='BE-004:' tests/qa/backend-core.test.mjs`. Freeze the clock, mock 404 for `/wait` and pending for direct GET, drain 200 microtasks without yielding to timers, and supply a terminal sixth response for cleanup. | Bounded, paced fallback requests; no repeated probe of a known unsupported wait route within the same wait. | Six requests run before any timer/event-loop turn. An earlier timed exploratory run also made 44 requests in approximately 102 ms; each loop retries both the unsupported wait endpoint and direct GET. | `src/index.ts:302`, `src/index.ts:309`, `src/index.ts:313`, `src/index.ts:324`; test at `tests/qa/backend-core.test.mjs:260`; final output. | Remember fallback mode for that wait call and add a deadline-aware bounded polling interval/backoff between pending responses. |
| BE-005 | Low | Backend | Plain-text HTTP errors lose their diagnostic body | Run `node --test --test-name-pattern='BE-005:' tests/qa/backend-core.test.mjs`. Return a real `Response` with status 502 and text `Synthetic gateway unavailable`, then call `getTenant`. | A `SentinelAPIError` containing status 502 and useful bounded response detail. | Error message is only `[502] ` because failed JSON parsing already consumed the body. | `src/index.ts:205`, `src/index.ts:210`; test at `tests/qa/backend-core.test.mjs:328`; final output. | Read response text once and parse JSON from that text when appropriate, retaining a bounded text fallback. |

## Auth, permissions and concurrency matrix

| Case | Result | Scope of proof |
| --- | --- | --- |
| Empty API key | Constructor rejects; zero requests | Client configuration only |
| Synthetic 401/403 | `SentinelAPIError`; zero protected executions and no retries | Mocked transport; real 403 additionally exercised on loopback |
| Synthetic 409/422/429/500/503 | Error is surfaced; protected action does not run | No automatic replay of non-idempotent work |
| Two concurrent clients | Each request retains its own synthetic Authorization header | Mocked clients plus allowed/denied clients on loopback |
| Global reconfiguration after wrapper creation | Previously created wrapper retains original client | Prevents accidental rebinding to the latest global client |
| Explicit rejection | Blocks execution with preserved action ID/reason | Includes empty reason fallback and contradictory approved/rejected response where rejection wins |
| Pending past deadline | Correctly throws `ApprovalTimeout` when a pending response returns | Does not resolve the late/stalled-response defects in BE-002 |
| Same idempotency key, concurrent wrapped calls | Both functions execute; requests carry creation idempotency semantics | README promises deduplication of approval creation, not exactly-once side effects. No extra finding counted; applications must own side-effect idempotency. |
| Cross-tenant server authorization, approver identity and token replay | Not tested | Requires server code or an authorized test service; SDK header tests cannot establish server enforcement |

## Contract and input testing

- The real HTTP test validates POST `/v1/approvals`, its object arguments, function/risk/approver fields, integer timeout coercion, auth/content-type/user-agent/idempotency headers, and subsequent GET `/v1/approvals/{action_id}/wait`. These match the checked-in request contract at `src/generated/api.d.ts:504` and wait route at `:925`.
- The checked-in wait response is typed `unknown` at `src/generated/api.d.ts:947`. This pass does not claim JSON-schema response validation or freshness against a live OpenAPI document. The task forbids fetching production schemas.
- Sixty-four deterministic seeded plain-JSON cases (seed `0x53454e54`) preserve reviewed/executed argument equality. BigInt and circular objects fail before I/O. Special-character path/query inputs remain encoded data in the tested classes.
- Existing timeout tests cover normal rounding boundaries. This pass concentrates on deadline enforcement, unsupported/lossy argument classes, malformed JSON, transport errors, structured error bodies, rejection and concurrent configuration.
- The 404 fallback has a passing terminal-response control, separating its working compatibility path from the resource-consumption defect.

## OWASP API risk review at the SDK boundary

| Risk area | Review result |
| --- | --- |
| API1: Object-level authorization | Action IDs are encoded; authorization is server-owned and unverified. No claim of server tenant isolation. |
| API2: Authentication | Empty key rejected; per-client headers and reconfiguration isolation verified with synthetic credentials. No token issuance, rotation or real-key validation performed. |
| API3: Property-level authorization | Approval response schema is not runtime-validated; permissions and allowed response fields are server-owned. Lossy approval intent is covered by BE-003. |
| API4: Resource consumption | Confirmed unbounded network wait and unpaced fallback (BE-002, BE-004). No load test or production traffic generated. |
| API5: Function-level authorization | SDK always sends its configured bearer credential; synthetic denial fails closed. Real role/permission enforcement remains untested. |
| API6: Sensitive business flows | Approval/execution argument consistency fails under mutation and lossy serialization (BE-001, BE-003). Wrapped side effects require their own idempotency. |
| API7: Server-side request forgery | Base URL is explicit caller configuration; no server is implemented here. No arbitrary external URL probes or SSRF testing performed. |
| API8: Security misconfiguration | Default API URL is HTTPS by source inspection; only explicitly configured loopback HTTP used in tests. Deployment, credential stores and production configuration are outside scope. |
| API9: Inventory management | Core approval/tenant/audit methods mapped against checked-in paths; generated response contracts have limited detail. Live schema drift unverified. |
| API10: Unsafe consumption | Malformed JSON and non-success status fail closed; plain-text error context is lost (BE-005). Runtime response shape/identity validation and malicious-server behavior are not exhaustively tested. |

## Coverage, constraints and follow-up

The coordinator owns baseline and final all-source coverage in [COVERAGE.md](COVERAGE.md). This pass adds coverage for constructors, rejection/timeout failures, transport exceptions, JSON/text error paths, fallback polling, tenant methods, argument mutation and client context. Its six TODOs increase executed coverage but are unresolved defects, not passing acceptance tests.

Remaining limits: no production API or notification channel, tenant/approver authorization backend, durable audit hash verification, true cross-process side-effect deduplication, workload-scale concurrency, browser application, or full framework runtime. Dependency vulnerability auditing and package/types testing belong to the Frontend substitute pass. No UI exists; screenshots and WCAG checks are not applicable to this pass.

Recommended order: BE-001 and BE-003 together (establish exact approved intent), BE-002 (enforce deadlines), BE-004 (pace fallback), then BE-005 (restore diagnostics). Re-run the TODO assertions as normal tests when fixes are made.

## Final runner compatibility note

Known-defect assertions execute as TODOs on Node 20+ and were verified failing for the intended reasons on Node 24/26. Node 18.17 treats failing TODOs as a nonzero process exit even with `fail 0`; `tests/qa/known-defect.mjs` therefore marks those cases explicitly skipped on Node 18, with their finding IDs. Passing controls still execute. This is a QA harness adjustment, not a product fix. See the consolidated runtime matrix in COVERAGE.md.
