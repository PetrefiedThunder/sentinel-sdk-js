Start: 2026-10-03T01:41:40+00:00
End: 2026-10-03T01:41:40+00:00
Command: python3 -c 'from pathlib import Path; paths=["README.md","tests/serializable.test.mjs","tests/timeout.test.mjs","tests/ai-sdk.test.mjs"]; [(print("\nFILE: "+p),print("\n".join(f"{i}: {x}" for i,x in enumerate(Path(p).read_text().splitlines(),1)))) for p in paths]'
Exit: 0


FILE: README.md
1: # Sentinel SDK for JavaScript / TypeScript
2: 
3: [![npm version](https://img.shields.io/badge/npm-coming%20soon-lightgrey.svg)](https://github.com/PetrefiedThunder/sentinel-sdk-js)
4: [![Node](https://img.shields.io/badge/node-%E2%89%A518.17-brightgreen.svg)](https://nodejs.org)
5: [![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
6: [![Status](https://img.shields.io/badge/status-public%20beta-blue.svg)](https://pauseapi.app)
7: 
8: **Human-in-the-loop approval for AI agents.**
9: 
10: One wrapper. Your function pauses execution, a human gets an email with
11: Approve/Reject buttons, and the function only runs once they click Approve.
12: 
13: > ⚠️ **The JS/TS SDK is pre-release — not yet published on npm.**
14: > Install directly from git until the first npm release:
15: >
16: > ```bash
17: > npm install github:PetrefiedThunder/sentinel-sdk-js
18: > ```
19: >
20: > `npm install sentinel-oversight` (below) will work once the package is
21: > published.
22: 
23: ```bash
24: # coming soon — not yet on npm
25: npm install sentinel-oversight
26: ```
27: 
28: ## Quick start
29: 
30: ```typescript
31: import { configure, oversight } from 'sentinel-oversight';
32: 
33: configure({ apiKey: process.env.SENTINEL_API_KEY! });
34: 
35: const wireTransfer = oversight(
36:   { riskLevel: 'high', approvers: ['alice@acme.com'] },
37:   async (amountCents: number, recipient: string) => {
38:     return stripe.transfers.create({
39:       amount: amountCents,
40:       destination: recipient,
41:     });
42:   }
43: );
44: 
45: // When the agent calls this:
46: await wireTransfer(50_000_00, 'acct_acme_corp');
47: // 1. Sentinel pauses execution.
48: // 2. alice@acme.com gets an email with Approve / Reject.
49: // 3. On Approve → stripe.transfers.create runs, return value flows back.
50: // 4. On Reject  → ApprovalRejected thrown.
51: // 5. On timeout → ApprovalTimeout thrown.
52: ```
53: 
54: ## What you get
55: 
56: - **One wrapper** — `oversight({...}, fn)` returns a new fn with the same signature
57: - **Magic-link approval** — signed HMAC tokens on Approve / Reject buttons
58: - **Postgres LISTEN/NOTIFY** — sub-100 ms decision propagation; the wait is real-time
59: - **Hash-chained audit log** — every approval is immutably recorded
60: - **Sync + async** — works with both plain functions and Promise-returning ones
61: - **Zero deps** — uses native `fetch`, no axios / undici tax
62: 
63: ## Approvers
64: 
65: Each entry in `approvers: [...]` is a string. Format determines the channel.
66: 
67: | Format | Channel |
68: |---|---|
69: | `alice@acme.com` | Email (default) |
70: | `mailto:alice@acme.com` | Email (explicit) |
71: | `sms:+15551234567` | SMS (requires registered consent) |
72: 
73: Mix as needed; every approver gets a notification, **first decision wins**.
74: 
75: ## Risk levels
76: 
77: `riskLevel`: `'low' \| 'medium' \| 'high' \| 'critical'`. Used by the dashboard
78: for prioritization.
79: 
80: ## Errors
81: 
82: ```typescript
83: import {
84:   SentinelError,
85:   SentinelConfigError,
86:   SentinelAPIError,
87:   ApprovalRejected,
88:   ApprovalTimeout,
89: } from 'sentinel-oversight';
90: 
91: try {
92:   await wireTransfer(50_000_00, 'acct_xyz');
93: } catch (e) {
94:   if (e instanceof ApprovalRejected) {
95:     console.log('Rejected:', e.reason);
96:   } else if (e instanceof ApprovalTimeout) {
97:     console.log('No decision in time:', e.actionId);
98:   } else if (e instanceof SentinelAPIError) {
99:     console.log(`API ${e.statusCode}:`, e.message);
100:   }
101: }
102: ```
103: 
104: ## Idempotency
105: 
106: Pass `idempotencyKey` to make approval creation safe to retry — the same
107: (tenant, key) replays the original response without creating duplicate
108: approvals or firing duplicate notifications. Same key with a different body
109: returns a 409. A string is used as-is; a function is called once per
110: invocation.
111: 
112: ```typescript
113: const wireTransfer = oversight(
114:   { riskLevel: 'high', idempotencyKey: () => crypto.randomUUID() },
115:   async (amountCents: number, recipient: string) => { /* ... */ }
116: );
117: 
118: // or directly:
119: await client.createApproval({
120:   functionName: 'wireTransfer',
121:   arguments: { amountCents: 50_000_00 },
122:   idempotencyKey: '[REDACTED: synthetic idempotency example]',
123: });
124: ```
125: 
126: ## Listing & pagination
127: 
128: `listApprovals` returns one page (`{ data, hasMore, nextCursor }`);
129: `iterApprovals` walks every page for you. Audit events:
130: `listAuditEventsPage` with the same shape.
131: 
132: ```typescript
133: const page = await client.listApprovals({ status: 'pending', limit: 20 });
134: // page.data, page.hasMore, page.nextCursor
135: 
136: for await (const approval of client.iterApprovals({ status: 'pending' })) {
137:   console.log(approval.action_id, approval.status);
138: }
139: ```
140: 
141: ## Tenant settings
142: 
143: ```typescript
144: import { SentinelClient } from 'sentinel-oversight';
145: 
146: const client = new SentinelClient({ apiKey: process.env.SENTINEL_API_KEY! });
147: 
148: await client.setDefaultApprovers(['ops@acme.com', 'sms:+15551234567']);
149: // now any oversight() call without `approvers` falls back to these
150: ```
151: 
152: ## Configuration
153: 
154: | Option | Default | Description |
155: |---|---|---|
156: | `apiKey` | _required_ | Your tenant API key (sk_live_…) |
157: | `apiUrl` | `https://api.pauseapi.app` | Backend URL |
158: | `timeoutSeconds` | `300` | Default approval timeout |
159: 
160: ## Audit log
161: 
162: ```typescript
163: const events = await client.listAuditEvents('act_abc123');
164: // each event has prev_hash + event_hash (SHA-256), verifiable chain
165: ```
166: 
167: ## Examples
168: 
169: Clone runnable examples:
170: 
171: ```bash
172: git clone https://github.com/PetrefiedThunder/sentinel-examples
173: ```
174: 
175: ## Links
176: 
177: - Website: [pauseapi.app](https://pauseapi.app)
178: - Dashboard: [app.pauseapi.app](https://app.pauseapi.app)
179: - Python SDK: [sentinel-oversight on PyPI](https://pypi.org/project/sentinel-oversight/)
180: - API source: [github.com/PetrefiedThunder/sentinel-api](https://github.com/PetrefiedThunder/sentinel-api)
181: 
182: ## License
183: 
184: MIT — © RegEngine, Inc.

FILE: tests/serializable.test.mjs
1: // Unit tests for ensureJsonSerializable — mirrors Python 0.1.8 test suite.
2: //
3: // Run with native node test runner:  node --test tests/serializable.test.mjs
4: import { test } from 'node:test';
5: import assert from 'node:assert/strict';
6: import { ensureJsonSerializable } from '../dist/index.js';
7: 
8: test('plain dict ok', () => {
9:   ensureJsonSerializable({ amount: 100, recipient: 'alice' });
10: });
11: 
12: test('nested dict ok', () => {
13:   ensureJsonSerializable({ meta: { tags: ['a', 'b'], n: 1 } });
14: });
15: 
16: test('primitives ok', () => {
17:   for (const v of [null, true, 1, 1.5, 'str', [], {}, [1, 2, 3]]) {
18:     ensureJsonSerializable(v);
19:   }
20: });
21: 
22: test('BigInt raises TypeError', () => {
23:   assert.throws(() => ensureJsonSerializable(123n), TypeError);
24: });
25: 
26: test('circular reference raises TypeError', () => {
27:   const a = {};
28:   a.self = a;
29:   assert.throws(() => ensureJsonSerializable(a), TypeError);
30: });
31: 
32: test('nested unserializable raises TypeError', () => {
33:   assert.throws(
34:     () => ensureJsonSerializable({ ok: 'yes', bad: 123n }),
35:     TypeError
36:   );
37: });

FILE: tests/timeout.test.mjs
1: // Unit tests for timeout_seconds integer coercion — stubs globalThis.fetch.
2: //
3: // The live API types ApprovalCreate.timeout_seconds as `integer` and returns
4: // HTTP 422 on a fractional value. The SDK must round to a whole number of
5: // seconds before sending. Run: node --test tests/timeout.test.mjs
6: import { test, beforeEach, afterEach } from 'node:test';
7: import assert from 'node:assert/strict';
8: import { SentinelClient } from '../dist/index.js';
9: 
10: const APPROVED = {
11:   action_id: 'act_test',
12:   status: 'approved',
13:   decision: 'approved',
14: };
15: 
16: const originalFetch = globalThis.fetch;
17: let recorded = [];
18: 
19: beforeEach(() => {
20:   recorded = [];
21:   globalThis.fetch = async (url, init = {}) => {
22:     recorded.push({ url: String(url), init });
23:     return new Response(JSON.stringify(APPROVED), { status: 200 });
24:   };
25: });
26: 
27: afterEach(() => {
28:   globalThis.fetch = originalFetch;
29: });
30: 
31: function makeClient(config = {}) {
32:   return new SentinelClient({
33:     apiKey: 'sk_test',
34:     apiUrl: 'https://stub.test',
35:     ...config,
36:   });
37: }
38: 
39: function createBody(rec) {
40:   return JSON.parse(rec.init.body);
41: }
42: 
43: test('createApproval rounds a fractional timeout down to the nearest int', async () => {
44:   const client = makeClient();
45:   await client.createApproval({
46:     functionName: 'wire',
47:     arguments: { amount: 1 },
48:     timeoutSeconds: 30.4,
49:   });
50:   const body = createBody(recorded[0]);
51:   assert.equal(body.timeout_seconds, 30);
52:   assert.equal(Number.isInteger(body.timeout_seconds), true);
53: });
54: 
55: test('createApproval rounds a fractional timeout up to the nearest int', async () => {
56:   const client = makeClient();
57:   await client.createApproval({
58:     functionName: 'wire',
59:     arguments: { amount: 1 },
60:     timeoutSeconds: 30.5,
61:   });
62:   const body = createBody(recorded[0]);
63:   assert.equal(body.timeout_seconds, 31);
64: });
65: 
66: test('createApproval clamps a sub-second timeout to a minimum of 1', async () => {
67:   const client = makeClient();
68:   await client.createApproval({
69:     functionName: 'wire',
70:     arguments: { amount: 1 },
71:     timeoutSeconds: 0.2,
72:   });
73:   const body = createBody(recorded[0]);
74:   assert.equal(body.timeout_seconds, 1);
75: });
76: 
77: test('createApproval leaves an integer timeout unchanged', async () => {
78:   const client = makeClient();
79:   await client.createApproval({
80:     functionName: 'wire',
81:     arguments: { amount: 1 },
82:     timeoutSeconds: 120,
83:   });
84:   assert.equal(createBody(recorded[0]).timeout_seconds, 120);
85: });
86: 
87: test('createApproval coerces the client default timeout to an int', async () => {
88:   const client = makeClient({ timeoutSeconds: 45.9 });
89:   await client.createApproval({
90:     functionName: 'wire',
91:     arguments: { amount: 1 },
92:   });
93:   const body = createBody(recorded[0]);
94:   assert.equal(body.timeout_seconds, 46);
95:   assert.equal(Number.isInteger(body.timeout_seconds), true);
96: });
97: 
98: test('wrap forwards a fractional timeout as an int on the POST body', async () => {
99:   const client = makeClient();
100:   const wrapped = client.wrap(
101:     { functionName: 'wire', timeoutSeconds: 90.7 },
102:     async (amount) => amount * 2
103:   );
104:   const result = await wrapped(21);
105:   assert.equal(result, 42);
106:   const create = recorded.find(
107:     (r) => r.url.endsWith('/v1/approvals') && r.init.method === 'POST'
108:   );
109:   assert.ok(create, 'expected a POST /v1/approvals call');
110:   assert.equal(createBody(create).timeout_seconds, 91);
111: });

FILE: tests/ai-sdk.test.mjs
1: // Unit tests for the Vercel AI SDK adapter — stubs globalThis.fetch.
2: // The `ai` package is NOT installed; the adapter is duck-typed, so these
3: // tests also prove the subpath import works without the peer dep.
4: //
5: // Run with native node test runner:  node --test tests/ai-sdk.test.mjs
6: import { test, beforeEach, afterEach } from 'node:test';
7: import assert from 'node:assert/strict';
8: import { SentinelClient, ApprovalRejected } from '../dist/index.js';
9: import { gated, gatedTools } from '../dist/adapters/ai-sdk.js';
10: 
11: const APPROVED = {
12:   action_id: 'act_test',
13:   status: 'approved',
14:   decision: 'approved',
15: };
16: 
17: const REJECTED = {
18:   action_id: 'act_test',
19:   status: 'rejected',
20:   decision: 'rejected',
21:   reason: 'nope',
22: };
23: 
24: const originalFetch = globalThis.fetch;
25: let recorded = [];
26: let responses = [];
27: 
28: beforeEach(() => {
29:   recorded = [];
30:   responses = [];
31:   globalThis.fetch = async (url, init = {}) => {
32:     recorded.push({ url: String(url), init });
33:     const body = responses.length > 0 ? responses.shift() : APPROVED;
34:     return new Response(JSON.stringify(body), { status: 200 });
35:   };
36: });
37: 
38: afterEach(() => {
39:   globalThis.fetch = originalFetch;
40: });
41: 
42: function makeClient() {
43:   return new SentinelClient({ apiKey: 'sk_test', apiUrl: 'https://stub.test' });
44: }
45: 
46: // Minimal AI SDK v6-shaped tool: tool({ description, inputSchema, execute })
47: // where execute is called as execute(input, options).
48: function makeTool(executeImpl) {
49:   return {
50:     description: 'Wire USD between accounts',
51:     inputSchema: { type: 'object' }, // opaque to the adapter
52:     execute: executeImpl,
53:   };
54: }
55: 
56: test('approved → original execute runs with original args', async () => {
57:   let received = null;
58:   const tool = makeTool(async (input, options) => {
59:     received = { input, options };
60:     return 'done';
61:   });
62: 
63:   const wrapped = gated(tool, {
64:     client: makeClient(),
65:     functionName: 'wire_transfer',
66:   });
67: 
68:   const opts = { toolCallId: 'call_1', messages: [] };
69:   const result = await wrapped.execute({ amount_usd: 50000, to: 'alice' }, opts);
70: 
71:   assert.equal(result, 'done');
72:   assert.deepEqual(received.input, { amount_usd: 50000, to: 'alice' });
73:   assert.equal(received.options, opts);
74: 
75:   // First request created the approval with the parsed input as arguments
76:   const body = JSON.parse(recorded[0].init.body);
77:   assert.equal(body.function_name, 'wire_transfer');
78:   assert.deepEqual(body.arguments, { amount_usd: 50000, to: 'alice' });
79: });
80: 
81: test('rejected → throws ApprovalRejected and never runs execute', async () => {
82:   responses = [REJECTED, REJECTED];
83:   let ran = false;
84:   const tool = makeTool(async () => {
85:     ran = true;
86:   });
87: 
88:   const wrapped = gated(tool, { client: makeClient(), functionName: 'wire' });
89: 
90:   await assert.rejects(
91:     () => wrapped.execute({ amount_usd: 1 }, { toolCallId: 'c', messages: [] }),
92:     ApprovalRejected
93:   );
94:   assert.equal(ran, false);
95: });
96: 
97: test('non-object input is wrapped under {input}', async () => {
98:   const tool = makeTool(async () => 'ok');
99:   const wrapped = gated(tool, { client: makeClient(), functionName: 'echo' });
100: 
101:   await wrapped.execute('plain string', { toolCallId: 'c', messages: [] });
102: 
103:   const body = JSON.parse(recorded[0].init.body);
104:   assert.deepEqual(body.arguments, { input: 'plain string' });
105: });
106: 
107: test('gated does not mutate the original tool', async () => {
108:   const original = async () => 'ok';
109:   const tool = makeTool(original);
110:   const wrapped = gated(tool, { client: makeClient(), functionName: 'x' });
111: 
112:   assert.equal(tool.execute, original);
113:   assert.notEqual(wrapped.execute, original);
114:   assert.equal(wrapped.description, tool.description);
115:   assert.equal(wrapped.inputSchema, tool.inputSchema);
116: });
117: 
118: test('gated throws on a tool without execute', () => {
119:   assert.throws(
120:     () => gated({ description: 'client-side tool' }, { client: makeClient() }),
121:     TypeError
122:   );
123: });
124: 
125: test('gatedTools uses record keys as functionName', async () => {
126:   const tools = gatedTools(
127:     {
128:       wire_transfer: makeTool(async () => 'wired'),
129:       delete_database: makeTool(async () => 'deleted'),
130:     },
131:     { client: makeClient() }
132:   );
133: 
134:   await tools.wire_transfer.execute({ amount_usd: 1 }, { toolCallId: 'c', messages: [] });
135:   await tools.delete_database.execute({ db: 'prod' }, { toolCallId: 'c', messages: [] });
136: 
137:   // Each call = 1 create + (0..n polls); first recorded body per tool is the create
138:   const bodies = recorded
139:     .filter((r) => r.init.body)
140:     .map((r) => JSON.parse(r.init.body));
141:   const names = bodies.map((b) => b.function_name);
142:   assert.ok(names.includes('wire_transfer'));
143:   assert.ok(names.includes('delete_database'));
144: });
