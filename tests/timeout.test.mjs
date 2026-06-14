// Unit tests for timeout_seconds integer coercion — stubs globalThis.fetch.
//
// The live API types ApprovalCreate.timeout_seconds as `integer` and returns
// HTTP 422 on a fractional value. The SDK must round to a whole number of
// seconds before sending. Run: node --test tests/timeout.test.mjs
import { test, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { SentinelClient } from '../dist/index.js';

const APPROVED = {
  action_id: 'act_test',
  status: 'approved',
  decision: 'approved',
};

const originalFetch = globalThis.fetch;
let recorded = [];

beforeEach(() => {
  recorded = [];
  globalThis.fetch = async (url, init = {}) => {
    recorded.push({ url: String(url), init });
    return new Response(JSON.stringify(APPROVED), { status: 200 });
  };
});

afterEach(() => {
  globalThis.fetch = originalFetch;
});

function makeClient(config = {}) {
  return new SentinelClient({
    apiKey: 'sk_test',
    apiUrl: 'https://stub.test',
    ...config,
  });
}

function createBody(rec) {
  return JSON.parse(rec.init.body);
}

test('createApproval rounds a fractional timeout down to the nearest int', async () => {
  const client = makeClient();
  await client.createApproval({
    functionName: 'wire',
    arguments: { amount: 1 },
    timeoutSeconds: 30.4,
  });
  const body = createBody(recorded[0]);
  assert.equal(body.timeout_seconds, 30);
  assert.equal(Number.isInteger(body.timeout_seconds), true);
});

test('createApproval rounds a fractional timeout up to the nearest int', async () => {
  const client = makeClient();
  await client.createApproval({
    functionName: 'wire',
    arguments: { amount: 1 },
    timeoutSeconds: 30.5,
  });
  const body = createBody(recorded[0]);
  assert.equal(body.timeout_seconds, 31);
});

test('createApproval clamps a sub-second timeout to a minimum of 1', async () => {
  const client = makeClient();
  await client.createApproval({
    functionName: 'wire',
    arguments: { amount: 1 },
    timeoutSeconds: 0.2,
  });
  const body = createBody(recorded[0]);
  assert.equal(body.timeout_seconds, 1);
});

test('createApproval leaves an integer timeout unchanged', async () => {
  const client = makeClient();
  await client.createApproval({
    functionName: 'wire',
    arguments: { amount: 1 },
    timeoutSeconds: 120,
  });
  assert.equal(createBody(recorded[0]).timeout_seconds, 120);
});

test('createApproval coerces the client default timeout to an int', async () => {
  const client = makeClient({ timeoutSeconds: 45.9 });
  await client.createApproval({
    functionName: 'wire',
    arguments: { amount: 1 },
  });
  const body = createBody(recorded[0]);
  assert.equal(body.timeout_seconds, 46);
  assert.equal(Number.isInteger(body.timeout_seconds), true);
});

test('wrap forwards a fractional timeout as an int on the POST body', async () => {
  const client = makeClient();
  const wrapped = client.wrap(
    { functionName: 'wire', timeoutSeconds: 90.7 },
    async (amount) => amount * 2
  );
  const result = await wrapped(21);
  assert.equal(result, 42);
  const create = recorded.find(
    (r) => r.url.endsWith('/v1/approvals') && r.init.method === 'POST'
  );
  assert.ok(create, 'expected a POST /v1/approvals call');
  assert.equal(createBody(create).timeout_seconds, 91);
});
