# Changelog

All notable changes to the Sentinel JavaScript / TypeScript SDK
(`sentinel-oversight` on npm). Follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/)
and [Semantic Versioning](https://semver.org/).

## [0.1.0] — 2026-05-26

Initial public release.

### Added
- `configure({ apiKey })` + `oversight({opts}, fn)` wrapper API,
  mirrors the Python SDK surface.
- `SentinelClient` class with:
  - `createApproval`, `getApproval`, `waitForDecision`
  - `getTenant`, `setDefaultApprovers`
  - `listAuditEvents`
  - `wrap()` — turns any sync or async function into an
    approval-gated version.
- Error hierarchy: `SentinelError`, `SentinelConfigError`,
  `SentinelAPIError`, `ApprovalRejected`, `ApprovalTimeout`.
- Client-side `ensureJsonSerializable` check — mirrors Python 0.1.8
  fail-fast fix (BigInt / circular ref / class instance → TypeError
  before any network call).
- `sentinel-oversight/langchain` subpath export — drop-in
  `SentinelCallbackHandler` for LangChain.js agents.
- Long-poll with Postgres LISTEN/NOTIFY-backed `/wait` endpoint;
  falls back to plain polling on older servers.
- Zero runtime dependencies — uses native `fetch` on Node ≥ 18.17.
- ESM-only, full TypeScript types (`.d.ts` + sourcemaps).
