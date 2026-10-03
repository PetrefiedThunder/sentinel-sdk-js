// Offline core QA: every fetch is replaced before a client request can occur.
import { test, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import {
  SentinelClient, SentinelAPIError, SentinelConfigError,
  ApprovalRejected, ApprovalTimeout, configure, oversight,
} from '../../dist/index.js';

const originalFetch = globalThis.fetch;
const originalNow = Date.now;
const apiUrl = 'http://127.0.0.1:1'; // No listener: unexpected real I/O fails locally.
const pending = { action_id: 'qa-action', status: 'pending', decision: 'pending' };
const approved = { ...pending, status: 'approved', decision: 'approved' };
const rejected = { ...pending, status: 'rejected', decision: 'rejected', reason: 'Denied by test approver' };
const json = (body, status = 200) => new Response(JSON.stringify(body), { status });
const makeClient = (config = {}) => new SentinelClient({ apiKey: 'qa-synthetic', apiUrl, ...config });
let requests;

beforeEach(() => {
  requests = [];
  globalThis.fetch = async (url, init = {}) => {
    requests.push({ url: String(url), init });
    return json(approved);
  };
});
afterEach(() => {
  globalThis.fetch = originalFetch;
  Date.now = originalNow;
});

function respond(handler) {
  globalThis.fetch = async (url, init = {}) => {
    const request = { url: String(url), init };
    requests.push(request);
    return handler(request, requests.length);
  };
}

test('BE control: missing API key fails before network', () => {
  assert.throws(() => makeClient({ apiKey: '' }), SentinelConfigError);
  assert.equal(requests.length, 0);
});

test('BE control: approved named and positional arguments execute once and preserve return values', async () => {
  const client = makeClient();
  let calls = 0;
  assert.equal(await client.wrap({}, ({ amount }) => { calls++; return amount; })({ amount: 7 }), 7);
  assert.equal(await client.wrap({}, (a, b) => { calls++; return a + b; })(2, 3), 5);
  assert.equal(calls, 2);
  assert.deepEqual(JSON.parse(requests[0].init.body).arguments, { amount: 7 });
  assert.deepEqual(JSON.parse(requests[2].init.body).arguments, { args: [2, 3] });
});

test('BE control: rejection blocks the protected action and retains reason/action ID', async () => {
  respond(() => json(rejected));
  let executions = 0;
  await assert.rejects(makeClient().wrap({}, () => executions++)(), (error) => {
    assert.ok(error instanceof ApprovalRejected);
    assert.equal(error.actionId, 'qa-action');
    assert.equal(error.reason, rejected.reason);
    return true;
  });
  assert.equal(executions, 0);
});

test('BE control: rejection wins a contradictory approved/rejected response', async () => {
  respond(() => json({ ...approved, decision: 'rejected', reason: '' }));
  let executions = 0;
  await assert.rejects(makeClient().wrap({}, () => executions++)(), /Approval rejected/);
  assert.equal(executions, 0);
});

for (const status of [401, 403, 409, 422, 429, 500, 503]) {
  test(`BE error matrix: HTTP ${status} stops execution without an automatic retry`, async () => {
    respond(() => json({ detail: `Synthetic HTTP ${status}` }, status));
    let executions = 0;
    await assert.rejects(makeClient().wrap({}, () => executions++)(), (error) => {
      assert.ok(error instanceof SentinelAPIError);
      assert.equal(error.statusCode, status);
      assert.match(error.message, /Synthetic HTTP/);
      assert.equal(error.url, `${apiUrl}/v1/approvals`);
      return true;
    });
    assert.equal(executions, 0);
    assert.equal(requests.length, 1);
  });
}

test('BE control: structured validation error survives normalization', async () => {
  respond(() => json({ detail: [{ loc: ['body', 'arguments'], msg: 'invalid' }] }, 422));
  await assert.rejects(makeClient().getTenant(), /arguments.*invalid/);
});

test('BE control: transport failure stops execution', async () => {
  respond(() => { throw new TypeError('Synthetic network failure'); });
  let executions = 0;
  await assert.rejects(makeClient().wrap({}, () => executions++)(), /Synthetic network failure/);
  assert.equal(executions, 0);
});

test('BE control: malformed successful JSON stops execution', async () => {
  respond(() => new Response('not JSON', { status: 200 }));
  let executions = 0;
  await assert.rejects(makeClient().wrap({}, () => executions++)(), SyntaxError);
  assert.equal(executions, 0);
});

test('BE control: pending decision past deadline throws ApprovalTimeout', async () => {
  let now = 1000;
  Date.now = () => now;
  respond(() => { now = 3000; return json(pending); });
  await assert.rejects(makeClient().waitForDecision('qa-action', 1), ApprovalTimeout);
});

test('BE control: 404 wait fallback can retrieve a valid approval', async () => {
  respond(({ url }) => url.includes('/wait?') ? json({ detail: 'No wait route' }, 404) : json(approved));
  assert.deepEqual(await makeClient().waitForDecision('qa-action'), approved);
  assert.equal(requests.length, 2);
  assert.equal(new URL(requests[1].url).pathname, '/v1/approvals/qa-action');
});

test('BE control: decision-only response is accepted for backward compatibility', async () => {
  respond(() => json({ action_id: 'qa-action', decision: 'approved' }));
  assert.equal((await makeClient().waitForDecision('qa-action')).decision, 'approved');
});

test('BE control: separately configured clients and captured wrappers keep their own auth context', async () => {
  const clientA = configure({ apiKey: 'qa-tenant-a', apiUrl });
  const wrapperA = oversight({}, (value) => value);
  const clientB = configure({ apiKey: 'qa-tenant-b', apiUrl });
  await Promise.all([wrapperA('a'), clientB.wrap({}, (value) => value)('b'), clientA.getTenant()]);
  const posts = requests.filter(({ init }) => init.method === 'POST');
  assert.equal(posts.length, 2);
  for (const { init } of posts) {
    const value = JSON.parse(init.body).arguments.args[0];
    assert.equal(new Headers(init.headers).get('Authorization'), `Bearer qa-tenant-${value}`);
  }
  assert.equal(new Headers(requests.find(({ url }) => url.endsWith('/tenants/me')).init.headers).get('Authorization'), 'Bearer qa-tenant-a');
});

test('BE control: path and query special characters remain data', async () => {
  respond(({ url }) => url.includes('/audit-events') ? json([]) : json(approved));
  for (const value of ['a/b', '..?limit=999&status=approved', '#fragment', '雪 + %', '\r\nheader']) {
    await makeClient().getApproval(value);
    const url = new URL(requests.at(-1).url);
    assert.equal(url.pathname, `/v1/approvals/${encodeURIComponent(value)}`);
    assert.equal(url.search, '');
    await makeClient().listAuditEvents(value);
    assert.equal(new URL(requests.at(-1).url).searchParams.get('action_id'), value);
  }
});

test('BE property control: seeded JSON values preserve approved and executed intent', async () => {
  let state = 0x53454e54;
  const next = () => (state = (Math.imul(state, 1664525) + 1013904223) >>> 0);
  for (let index = 0; index < 64; index++) {
    const value = { amount: next() % 1000000, enabled: Boolean(next() & 1), tags: [`x-${next()}`, null], nested: { n: next() } };
    const result = await makeClient().wrap({}, (arg) => arg)(value);
    assert.deepEqual(JSON.parse(requests.at(-2).init.body).arguments, result);
  }
});

test('BE control: circular and BigInt arguments fail before request or execution', async () => {
  const circular = {};
  circular.self = circular;
  let executions = 0;
  for (const arg of [circular, { amount: 1n }]) {
    await assert.rejects(makeClient().wrap({}, () => executions++)(arg), TypeError);
  }
  assert.equal(requests.length, 0);
  assert.equal(executions, 0);
});

test('BE control: tenant settings and legacy audit list use expected wire shapes', async () => {
  respond(({ url, init }) => url.includes('/audit-events') ? json([]) : json(init.body ? JSON.parse(init.body) : {}));
  const client = makeClient();
  assert.deepEqual(await client.setDefaultApprovers(['qa@example.invalid']), { default_approvers: ['qa@example.invalid'] });
  assert.equal(requests[0].init.method, 'PATCH');
  assert.deepEqual(await client.listAuditEvents(), []);
  assert.equal(new URL(requests.at(-1).url).search, '');
});

test('BE idempotency scope control: replayed approval does not deduplicate wrapped side effects', async () => {
  let executions = 0;
  const wrapped = makeClient().wrap({ idempotencyKey: 'qa-one-approval' }, () => ++executions);
  assert.deepEqual(await Promise.all([wrapped(), wrapped()]), [1, 2]);
  assert.equal(executions, 2); // Documented creation-only guarantee, not an assertion of exactly-once execution.
  assert.equal(requests.filter(({ init }) => init.method === 'POST').length, 2);
});

test('BE-001: mutation during approval wait must not change the executed intent', async () => {
  let release;
  let started;
  const waiting = new Promise((resolve) => { started = resolve; });
  respond(({ init }) => {
    if (init.method === 'POST') return json(pending);
    started();
    return new Promise((resolve) => { release = () => resolve(json(approved)); });
  });
  const args = { transfer: { amount: 1, recipient: 'qa-reviewed' } };
  let executed;
  const result = makeClient().wrap({}, (arg) => { executed = structuredClone(arg); })(args);
  await waiting;
  const reviewed = JSON.parse(requests[0].init.body).arguments;
  args.transfer.amount = 999;
  args.transfer.recipient = 'qa-changed';
  release();
  await result;
  assert.deepEqual(executed, reviewed, 'executed payload must match the human-reviewed request');
});

test('BE-001: positional arguments are copied before idempotency callbacks can mutate them', async () => {
  const value = { nested: [1, 2] };
  const wrapped = makeClient().wrap({
    idempotencyKey: () => { value.nested.push(999); return 'qa-snapshot'; },
  }, (label, arg) => {
    assert.equal(label, 'reviewed');
    assert.deepEqual(arg, { nested: [1, 2] });
    assert.notEqual(arg, value);
    arg.nested.push(3); // The function may still mutate its private copy.
    return arg;
  });
  assert.deepEqual(await wrapped('reviewed', value), { nested: [1, 2, 3] });
  assert.deepEqual(JSON.parse(requests[0].init.body).arguments, { args: ['reviewed', { nested: [1, 2] }] });
  assert.deepEqual(value, { nested: [1, 2, 999] });
});

test('BE-002: approval received after deadline must not execute the action', async () => {
  let now = 1000;
  Date.now = () => now;
  respond(({ init }) => {
    if (init.method === 'POST') return json(pending);
    now = 3000;
    return json(approved);
  });
  let executions = 0;
  const result = await makeClient().wrap({ timeoutSeconds: 1 }, () => ++executions)().catch((error) => error);
  assert.equal(executions, 0, 'a late approval must not run the protected action');
  assert.ok(result instanceof ApprovalTimeout);
});

test('BE-002: a stalled request must settle at the approval deadline', async () => {
  let release;
  respond(() => new Promise((resolve) => { release = () => resolve(json(approved)); }));
  const result = makeClient().waitForDecision('qa-action', 0.01).then(
    () => 'approved', (error) => error instanceof ApprovalTimeout ? 'timeout' : error.name,
  );
  let watchdog;
  const observed = await Promise.race([result, new Promise((resolve) => { watchdog = setTimeout(() => resolve('still-pending'), 80); })]);
  clearTimeout(watchdog);
  release();
  await result;
  assert.equal(observed, 'timeout');
});

for (const stage of ['creation', 'decision', 'body', 'fallback']) {
  test(`BE-002: stalled ${stage} is aborted and cannot execute after a late response`, async () => {
    let release;
    let stalledSignal;
    respond(({ url, init }) => {
      if (stage !== 'creation' && init.method === 'POST') return json(pending);
      if (stage === 'fallback' && url.includes('/wait?')) return json({ detail: 'No wait route' }, 404);
      stalledSignal = init.signal;
      const stalled = new Promise((resolve) => { release = () => resolve(stage === 'body' ? approved : json(approved)); });
      return stage === 'body' ? { ok: true, json: () => stalled } : stalled;
    });
    let executions = 0;
    const result = makeClient().wrap({ timeoutSeconds: 0.015 }, () => ++executions)();
    await assert.rejects(result, ApprovalTimeout);
    assert.equal(stalledSignal.aborted, true);
    const count = requests.length;
    release();
    await new Promise((resolve) => setImmediate(resolve));
    assert.equal(executions, 0);
    assert.equal(requests.length, count, 'no follow-up I/O after deadline');
  });
}

test('BE-002: creation and polling share one wrapper deadline', async () => {
  let now = 1000;
  Date.now = () => now;
  respond(({ init }) => {
    now = init.method === 'POST' ? 1700 : 2100;
    return json(init.method === 'POST' ? pending : approved);
  });
  let executions = 0;
  await assert.rejects(makeClient().wrap({ timeoutSeconds: 1 }, () => ++executions)(), ApprovalTimeout);
  assert.equal(executions, 0);
});

test('BE-002: standalone creation has a deadline and pre-aborted requests do no I/O', async () => {
  let signal;
  respond(({ init }) => { signal = init.signal; return new Promise(() => {}); });
  await assert.rejects(makeClient().createApproval({ functionName: 'qa', arguments: {}, timeoutSeconds: 0.01 }), ApprovalTimeout);
  assert.equal(signal.aborted, true);
  requests.length = 0;
  const controller = new AbortController();
  controller.abort(new Error('Synthetic cancellation'));
  await assert.rejects(makeClient().createApproval({ functionName: 'qa', arguments: {}, signal: controller.signal }), /Synthetic cancellation/);
  await assert.rejects(makeClient().waitForDecision('qa-action', 1, controller.signal), /Synthetic cancellation/);
  assert.equal(requests.length, 0);
});

test('BE-002: invalid or expired timeout fails without network I/O', async () => {
  for (const timeoutSeconds of [NaN, Infinity, -1, 0]) {
    await assert.rejects(makeClient().wrap({ timeoutSeconds }, () => assert.fail('must not execute'))());
  }
  assert.equal(requests.length, 0);
});

test('BE-002: long approval windows do not overflow the Node timer', async () => {
  respond(async () => {
    await new Promise((resolve) => setTimeout(resolve, 20));
    return json(approved);
  });
  assert.deepEqual(await makeClient().waitForDecision('qa-action', 30 * 24 * 3600), approved);
});

test('BE-002: in-flight parent cancellation aborts transport with the original reason', async () => {
  const controller = new AbortController();
  const reason = new Error('Synthetic cancellation');
  let signal;
  respond(({ init }) => { signal = init.signal; return new Promise(() => {}); });
  const result = makeClient().waitForDecision('qa-action', 30, controller.signal);
  controller.abort(reason);
  await assert.rejects(result, (error) => error === reason);
  assert.equal(signal.aborted, true);
  assert.equal(signal.reason, reason);
});

test('BE-002: malformed decision records fail closed instead of spinning until timeout', async () => {
  for (const record of [null, {}, { ...approved, action_id: 'other' }, { ...approved, decision: 'pending' }, { ...approved, status: 'invalid' }]) {
    respond(({ init }) => json(init.method === 'POST' ? pending : record));
    await assert.rejects(makeClient().wrap({}, () => assert.fail('must not execute'))());
  }
});

test('BE-003: lossy non-JSON arguments must fail before approval or execution', async () => {
  const cases = [
    { amount: Number.NaN }, { amount: Infinity }, { hidden: undefined },
    { targets: new Set(['qa-target']) }, { targets: new Map([['recipient', 'qa-target']]) },
    { operation: () => 'qa-action' },
  ];
  const accepted = [];
  for (const value of cases) {
    let executed = false;
    await makeClient().wrap({}, () => { executed = true; })(value).catch((error) => {
      assert.ok(error instanceof TypeError);
    });
    if (executed) accepted.push(Object.keys(value)[0]);
  }
  assert.deepEqual(accepted, [], 'silently omitted or changed data must not execute under a different approved payload');
  assert.equal(requests.length, 0);
});

test('BE-003: nested unsupported values and serialization hooks fail without executing hooks', async () => {
  let hooks = 0;
  const accessor = Object.defineProperty({}, 'amount', { enumerable: true, get() { hooks++; return 1; } });
  const customArray = Object.assign([1], { hiddenIntent: 2 });
  const cases = [
    undefined, Symbol('value'), () => 1, -Infinity, new Date(), /pattern/,
    Object(1), new (class Transfer { amount = 1; })(), new (class extends Array {})(),
    { nested: [undefined] }, { nested: [Symbol('value')] }, [1, , 3], customArray,
    { [Symbol('intent')]: 1 }, Object.defineProperty({}, 'hidden', { value: 1 }),
    accessor, { toJSON() { hooks++; return { amount: 1 }; } },
  ];
  let executions = 0;
  for (const value of cases) {
    await assert.rejects(makeClient().wrap({}, () => executions++)(value), TypeError);
    await assert.rejects(makeClient().createApproval({ functionName: 'qa', arguments: value }), TypeError);
  }
  assert.equal(hooks, 0);
  assert.equal(requests.length, 0);
  assert.equal(executions, 0);
});

test('BE-003: repeated references, null prototypes and __proto__ data preserve JSON intent', async () => {
  const shared = { amount: 1 };
  const value = Object.assign(Object.create(null), JSON.parse('{"__proto__":{"safe":true}}'), {
    first: shared, second: shared, zero: -0,
  });
  const result = await makeClient().wrap({}, (arg) => arg)(value);
  assert.deepEqual(result, JSON.parse(requests[0].init.body).arguments);
  assert.equal(Object.getPrototypeOf(result), Object.prototype);
  assert.equal(Object.hasOwn(result, '__proto__'), true);
  assert.equal(Object.hasOwn(Object.prototype, 'safe'), false);
  assert.equal(Object.is(result.zero, 0), true);
});

test('BE-004: legacy fallback polling must be paced', async () => {
  let now = 1000;
  Date.now = () => now;
  respond(({ url }, number) => {
    // The sixth request terminates an unpaced loop; no socket or timer is used.
    return url.includes('/wait?') ? json({ detail: 'No wait route' }, 404) : json(number >= 6 ? approved : pending);
  });
  const result = makeClient().waitForDecision('qa-action', 1).catch((error) => error);
  // Flush async fetch/JSON microtasks while deliberately never yielding to timers.
  for (let index = 0; index < 200; index++) await Promise.resolve();
  const beforeTimerTurn = requests.length;
  now = 3000; // A paced implementation can exit at its next deadline check.
  await result;
  assert.ok(beforeTimerTurn <= 2, `${beforeTimerTurn} requests ran before a timer/event-loop turn; fallback must be paced`);
});

test('BE-004: fallback remembers unsupported wait endpoint and accepts the next paced decision', async () => {
  respond(({ url }, number) => url.includes('/wait?')
    ? json({ detail: 'No wait route' }, 404)
    : json(number >= 3 ? approved : pending));
  assert.deepEqual(await makeClient().waitForDecision('qa-action', 3), approved);
  assert.equal(requests.filter(({ url }) => url.includes('/wait?')).length, 1);
  assert.equal(requests.length, 3);
});

test('BE-004: fallback sleep respects cancellation and does not send another request', async () => {
  const controller = new AbortController();
  respond(({ url }) => url.includes('/wait?') ? json({ detail: 'No wait route' }, 404) : json(pending));
  const result = makeClient().waitForDecision('qa-action', 30, controller.signal);
  await new Promise((resolve) => setImmediate(resolve));
  controller.abort(new Error('Synthetic cancelled poll'));
  await assert.rejects(result, /Synthetic cancelled poll/);
  assert.equal(requests.length, 2);
});

test('BE loopback contract: real HTTP preserves approval payload/auth and rejects unauthorized actions', { timeout: 5000 }, async (t) => {
  const wire = [];
  const server = createServer(async (request, response) => {
    let body = '';
    for await (const chunk of request) body += chunk;
    wire.push({ method: request.method, path: request.url, headers: request.headers, body });
    response.setHeader('Content-Type', 'application/json');
    if (request.headers.authorization !== 'Bearer qa-loopback-allowed') {
      response.writeHead(403).end(JSON.stringify({ detail: 'Synthetic permission denied' }));
    } else {
      response.end(JSON.stringify(request.method === 'POST' ? pending : approved));
    }
  });
  await new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', resolve);
  });
  t.after(async () => {
    server.closeAllConnections();
    await new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
  });
  const address = server.address();
  const localUrl = `http://127.0.0.1:${address.port}`;
  globalThis.fetch = (url, init) => {
    assert.equal(new URL(url).origin, localUrl, 'only the ephemeral loopback server may receive real requests');
    return originalFetch(url, init);
  };
  let allowedExecutions = 0;
  let deniedExecutions = 0;
  const allowed = makeClient({ apiKey: 'qa-loopback-allowed', apiUrl: localUrl });
  const denied = makeClient({ apiKey: 'qa-loopback-denied', apiUrl: localUrl });
  await Promise.all([
    allowed.wrap({ functionName: 'qaContract', idempotencyKey: 'qa-loopback-id', timeoutSeconds: 30.5 }, (args) => {
      allowedExecutions++;
      return args.amount;
    })({ amount: 42 }),
    assert.rejects(denied.wrap({}, () => deniedExecutions++)(), (error) => error instanceof SentinelAPIError && error.statusCode === 403),
  ]);
  assert.equal(allowedExecutions, 1);
  assert.equal(deniedExecutions, 0);
  const post = wire.find((entry) => entry.method === 'POST' && entry.headers.authorization === 'Bearer qa-loopback-allowed');
  assert.deepEqual(JSON.parse(post.body), {
    function_name: 'qaContract', arguments: { amount: 42 }, risk_level: 'medium', approvers: [], timeout_seconds: 31,
  });
  assert.equal(post.path, '/v1/approvals');
  assert.equal(post.headers['idempotency-key'], 'qa-loopback-id');
  assert.equal(post.headers['content-type'], 'application/json');
  assert.match(post.headers['user-agent'], /^sentinel-sdk-js\//);
  assert.equal(wire.filter((entry) => entry.headers.authorization === 'Bearer qa-loopback-denied').length, 1);
  assert.ok(wire.some((entry) => entry.method === 'GET' && entry.path.startsWith('/v1/approvals/qa-action/wait?timeout=')));
});

test('BE-005: plain-text HTTP error retains useful response detail', async () => {
  respond(() => new Response('Synthetic gateway unavailable', { status: 502 }));
  await assert.rejects(makeClient().getTenant(), (error) => {
    assert.ok(error instanceof SentinelAPIError);
    assert.equal(error.statusCode, 502);
    assert.match(error.message, /Synthetic gateway unavailable/);
    return true;
  });
});

test('BE-005: plain-text diagnostics are bounded and structured JSON errors still work', async () => {
  for (const [body, expected] of [
    ['x'.repeat(700), 'x'.repeat(500)],
    [JSON.stringify({ detail: 'Synthetic detail' }), 'Synthetic detail'],
    [JSON.stringify({ message: 'Synthetic message' }), 'Synthetic message'],
    ['null', 'null'],
  ]) {
    respond(() => new Response(body, { status: 502 }));
    await assert.rejects(makeClient().getTenant(), (error) => {
      assert.ok(error instanceof SentinelAPIError);
      assert.equal(error.message, `[502] ${expected}`);
      return true;
    });
  }
});
