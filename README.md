# Sentinel SDK for JavaScript / TypeScript

[![npm version](https://img.shields.io/npm/v/sentinel-oversight.svg)](https://www.npmjs.com/package/sentinel-oversight)
[![Node](https://img.shields.io/badge/node-%E2%89%A518.17-brightgreen.svg)](https://nodejs.org)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![Status](https://img.shields.io/badge/status-public%20beta-blue.svg)](https://pauseapi.app)

**Human-in-the-loop approval for AI agents.**

One wrapper. Your function pauses execution, a human gets an email with
Approve/Reject buttons, and the function only runs once they click Approve.

```bash
npm install sentinel-oversight
```

## Quick start

```typescript
import { configure, oversight } from 'sentinel-oversight';

configure({ apiKey: process.env.SENTINEL_API_KEY! });

const wireTransfer = oversight(
  { riskLevel: 'high', approvers: ['alice@acme.com'] },
  async (amountCents: number, recipient: string) => {
    return stripe.transfers.create({
      amount: amountCents,
      destination: recipient,
    });
  }
);

// When the agent calls this:
await wireTransfer(50_000_00, 'acct_acme_corp');
// 1. Sentinel pauses execution.
// 2. alice@acme.com gets an email with Approve / Reject.
// 3. On Approve → stripe.transfers.create runs, return value flows back.
// 4. On Reject  → ApprovalRejected thrown.
// 5. On timeout → ApprovalTimeout thrown.
```

## What you get

- **One wrapper** — `oversight({...}, fn)` returns a new fn with the same signature
- **Magic-link approval** — signed HMAC tokens on Approve / Reject buttons
- **Postgres LISTEN/NOTIFY** — sub-100 ms decision propagation; the wait is real-time
- **Hash-chained audit log** — every approval is immutably recorded
- **Sync + async** — works with both plain functions and Promise-returning ones
- **Zero deps** — uses native `fetch`, no axios / undici tax

## Approvers

Each entry in `approvers: [...]` is a string. Format determines the channel.

| Format | Channel |
|---|---|
| `alice@acme.com` | Email (default) |
| `mailto:alice@acme.com` | Email (explicit) |
| `sms:+15551234567` | SMS (requires registered consent) |

Mix as needed; every approver gets a notification, **first decision wins**.

## Risk levels

`riskLevel`: `'low' \| 'medium' \| 'high' \| 'critical'`. Used by the dashboard
for prioritization.

## Errors

```typescript
import {
  SentinelError,
  SentinelConfigError,
  SentinelAPIError,
  ApprovalRejected,
  ApprovalTimeout,
} from 'sentinel-oversight';

try {
  await wireTransfer(50_000_00, 'acct_xyz');
} catch (e) {
  if (e instanceof ApprovalRejected) {
    console.log('Rejected:', e.reason);
  } else if (e instanceof ApprovalTimeout) {
    console.log('No decision in time:', e.actionId);
  } else if (e instanceof SentinelAPIError) {
    console.log(`API ${e.statusCode}:`, e.message);
  }
}
```

## Tenant settings

```typescript
import { SentinelClient } from 'sentinel-oversight';

const client = new SentinelClient({ apiKey: process.env.SENTINEL_API_KEY! });

await client.setDefaultApprovers(['ops@acme.com', 'sms:+15551234567']);
// now any oversight() call without `approvers` falls back to these
```

## Configuration

| Option | Default | Description |
|---|---|---|
| `apiKey` | _required_ | Your tenant API key (sk_live_…) |
| `apiUrl` | `https://api.pauseapi.app` | Backend URL |
| `timeoutSeconds` | `300` | Default approval timeout |

## Audit log

```typescript
const events = await client.listAuditEvents('act_abc123');
// each event has prev_hash + event_hash (SHA-256), verifiable chain
```

## Examples

Clone runnable examples:

```bash
git clone https://github.com/PetrefiedThunder/sentinel-examples
```

## Links

- Website: [pauseapi.app](https://pauseapi.app)
- Dashboard: [app.pauseapi.app](https://app.pauseapi.app)
- Python SDK: [sentinel-oversight on PyPI](https://pypi.org/project/sentinel-oversight/)
- API source: [github.com/PetrefiedThunder/sentinel-api](https://github.com/PetrefiedThunder/sentinel-api)

## License

MIT — © RegEngine, Inc.
