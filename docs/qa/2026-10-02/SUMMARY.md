# QA summary — Sentinel JavaScript SDK

PR: opened by orchestrator
CI status: pending at time of writing

**Recommendation: fix the approval bypass and approved-intent defects before relying on this SDK to protect side effects.** This QA change records defects and adds tests; it does not fix product behavior.

Counts: Critical=1 High=4 Medium=6 Low=2

| Group | Critical | High | Medium | Low | Total |
| --- | ---: | ---: | ---: | ---: | ---: |
| Backend | 0 | 3 | 1 | 1 | 5 |
| Frontend | 1 | 1 | 3 | 0 | 5 |
| UX | 0 | 0 | 2 | 1 | 3 |

## Top five risks

1. **FE-001 — Critical:** Real LangChain tools execute without requesting approval; rejection/timeout can also be swallowed.
2. **BE-001 — High:** A caller can change arguments while approval is pending and execute a different action from the one reviewed.
3. **BE-002 — High:** A stalled HTTP request can outlive the approval timeout, and a late approval still runs the action.
4. **BE-003 — High:** JSON conversion hides or changes unsupported arguments while the original values reach the protected action.
5. **FE-004 — High:** The README's Git install succeeds but produces an SDK that cannot be imported because built files are missing.

## Evidence and change scope

All three passes are complete with separate logs and reports. The original 32 tests passed. With the optional real LangChain package enabled, the final 110-test run has **86 pass, 24 expected failures/TODO, zero unexpected failures**, on Node 24.21.0 and Node 26.7.0. Without it, default npm test has 83 pass, 19 TODO and 8 explicit skips. Node 18.17.1 has 83 pass and 27 explicit skips after working around that old runner's TODO exit behavior. All final commands exit 0. Build/typecheck pass. Coverage rises **67.01% → 98.65% lines**, counting expected-failure execution; this is not a claim the defects are fixed.

Added four QA suites, consumer/runtime fixtures, a small test-only known-defect compatibility helper, five required documents, separate pass/review reports, timestamped command logs and text/JSON artifacts. `package.json` changes only the explicit test file list; no dependencies, lockfile, product source, deployment configuration, migrations, environment files or scan ignore lists changed. No product one-liner fixes were applied. Independent gate review challenged findings, corrected test-script portability and verified actual failure reasons; see REVIEW.md.

Dependency advisories are scoped: 34 affected development/release-tree entries, zero runtime-tree advisories. This is FE-900 Medium at repository level, even though upstream metadata contains one critical and 33 high ratings. The tracked source/doc/manifest/workflow secret scan found no confirmed secret exposure; one synthetic README idempotency example was a generic-rule false positive and its scanner payload is redacted. A final default-rule Gitleaks scan of 177 QA/manifest files (1.82 MB) then passed with no leaks; see [final scan](artifacts/coord-final-added-secret-scan.txt).

## Recommended fix order

1. FE-001: repair both LangChain callback flags and promote its real-framework rejection/timeout tests into required supported-version coverage.
2. BE-001 + BE-003: establish one supported immutable approved argument representation and execute only that intent.
3. BE-002, then BE-004: bound transport and execution by a deadline; pace compatibility polling.
4. FE-004: repair and validate clean Git installation before advertising it as the installation route.
5. FE-002 + FE-003: fix typed-tool acceptance and adapter idempotency forwarding.
6. UX-001 + UX-002 + UX-003 and BE-005: correct examples/recovery guidance and retain HTTP error context.
7. FE-900: upgrade compatible release tooling, inspect bundled transitive versions, and rerun the audit.

## Limits and orchestrator handoff

No live Sentinel/API/model/provider/database/billing or notification flow was tested; the task prohibited production contact. Server-side tenant authorization, approval tokens, durable audit integrity and true cross-process races remain unverified. Older framework versions and real Mastra are untested. No UI exists, so browser/axe/responsive/Lighthouse checks and screenshots are inapplicable; their replacement methods and transcripts are in PLAN.md and the pass reports. No Windows run or current published-package lookup was performed. Detailed uncovered branches and runtime limitations are in COVERAGE.md.

The working tree is intentionally **uncommitted** on `qa/2026-10-02-sweep`. No commit, push, PR creation, merge or deploy was performed. The required PR line above records ownership: the orchestrator must review/scan the diff, commit, push and open the single draft PR. **No PR URL is available from this run; remote CI is pending and unverified.**

Final local handoff check: branch `qa/2026-10-02-sweep`, unchanged HEAD `717392b253a4bcf5c4b5751cafb758f7d86aa323`, no staged files, only package test configuration plus new QA docs/tests. `git diff --check` passes; evidence is [final scope](artifacts/coord-final-scope-check.txt). All local review corrections are resolved.

Fix pass: see FIXES.md
