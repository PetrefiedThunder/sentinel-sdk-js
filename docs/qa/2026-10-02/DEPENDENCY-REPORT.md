# Dependency and package security evidence

Group: Frontend replacement (package consumer/build toolchain).

| ID | Severity | Group | Title | Exact repro | Expected vs actual | Evidence | Suggested fix |
| --- | --- | --- | --- | --- | --- | --- | --- |
| FE-900 | Medium | Frontend | Release/development dependency tree retains critical/high upstream advisories | Run `npm ci --ignore-scripts --no-audit --no-fund`; run `npm audit --json`; compare `npm audit --omit=dev --json`; inspect `npm ls tar undici --all`. | Expected: release tooling has no unresolved high-impact advisories. Actual: audit reports 34 affected package entries (1 critical, 33 high); runtime-only audit reports 0. Locked npm bundles tar 7.5.16 and undici 6.26.0 despite the top-level undici override. | `package-lock.json:4460`, `package-lock.json:4556`, `package.json:78`; [audit](artifacts/coord-audit.txt), [runtime audit](artifacts/coord-audit-runtime.txt), [dependency paths](artifacts/coord-dependency-paths.txt). | Upgrade/re-resolve compatible semantic-release/npm tooling and its bundled dependencies, verify the actual installed tree and rerun audit. Do not blindly force npm audit fixes across release-tool major versions. |

The repository finding is Medium because the observed exposure is development/release tooling, not shipped SDK runtime dependencies; no vulnerability exploit or compromise was tested or observed. Upstream severity is recorded without treating every transitive effect as a distinct product finding. Representative upstream advisory links appear in the full registry report, including tar decompression/resource exhaustion. Registry results are time-specific to this run. Audit evidence is a public metadata lookup, not a production request.

The built npm artifact has 27 entries and contains only dist, README, LICENSE and package.json. No test artifacts, credential/environment files or node_modules are packaged ([pack report](artifacts/coord-pack.txt)). Consumer installation from unbuilt source is a separate frontend finding; a successful pack of already-built output does not resolve it.

Secret scan: one generic-rule alert at README.md:122 was triaged as an illustrative idempotency value. Report payload is redacted. No confirmed secret exposure in the 31-file tracked source/doc/manifest/workflow snapshot. Git history and credential/environment files were deliberately not read. No scanner rules or baselines were modified.
