// Unit tests for Idempotency-Key support — stubs globalThis.fetch.
//
// Run with native node test runner:  node --test tests/idempotency.test.mjs
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

function makeClient() {
  return new SentinelClient({ apiKey: 'sk_test', apiUrl: 'https://stub.test' });
}

test('createApproval with idempotencyKey sends Idempotency-Key header', async () => {
  const client = makeClient();
  await client.createApproval({
    functionName: 'wire',
    arguments: { amount: 1 },
    idempotencyKey: 'key-123',
  });
  assert.equal(recorded.length, 1);
  const headers = new Headers(recorded[0].init.headers);
  assert.equal(headers.get('Idempotency-Key'), 'key-123');
});

test('createApproval without idempotencyKey omits the header', async () => {
  const client = makeClient();
  await client.createApproval({
    functionName: 'wire',
    arguments: { amount: 1 },
  });
  assert.equal(recorded.length, 1);
  const headers = new Headers(recorded[0].init.headers);
  assert.equal(headers.get('Idempotency-Key'), null);
});

test('wrap with function-valued idempotencyKey calls generator and sends header', async () => {
  const client = makeClient();
  let calls = 0;
  const wrapped = client.wrap(
    {
      functionName: 'wire',
      idempotencyKey: () => {
        calls += 1;
        return `gen-key-${calls}`;
      },
    },
    async (amount) => amount * 2
  );
  const result = await wrapped(21);
  assert.equal(result, 42);
  assert.equal(calls, 1);
  const create = recorded.find(
    (r) => r.url.endsWith('/v1/approvals') && r.init.method === 'POST'
  );
  assert.ok(create, 'expected a POST /v1/approvals call');
  const headers = new Headers(create.init.headers);
  assert.equal(headers.get('Idempotency-Key'), 'gen-key-1');
});
