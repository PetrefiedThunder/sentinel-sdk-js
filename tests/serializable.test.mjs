// Unit tests for ensureJsonSerializable — mirrors Python 0.1.8 test suite.
//
// Run with native node test runner:  node --test tests/serializable.test.mjs
import { test, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { ensureJsonSerializable, SentinelClient } from '../dist/index.js';

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

test('plain dict ok', () => {
  ensureJsonSerializable({ amount: 100, recipient: 'alice' });
});

test('nested dict ok', () => {
  ensureJsonSerializable({ meta: { tags: ['a', 'b'], n: 1 } });
});

test('primitives ok', () => {
  for (const v of [null, true, 1, 1.5, 'str', [], {}, [1, 2, 3]]) {
    ensureJsonSerializable(v);
  }
});

test('BigInt raises TypeError', () => {
  assert.throws(() => ensureJsonSerializable(123n), TypeError);
});

test('circular reference raises TypeError', () => {
  const a = {};
  a.self = a;
  assert.throws(() => ensureJsonSerializable(a), TypeError);
});

test('nested unserializable raises TypeError', () => {
  assert.throws(
    () => ensureJsonSerializable({ ok: 'yes', bad: 123n }),
    TypeError
  );
});

test('Map and Set raise TypeError, including when nested', () => {
  assert.throws(() => ensureJsonSerializable(new Map([['recipient', 'alice']])), /Map/);
  assert.throws(() => ensureJsonSerializable(new Set(['qa-target'])), /Set/);
  assert.throws(
    () => ensureJsonSerializable({ extra: { tags: new Set(['qa']) } }),
    /Set/
  );
  assert.throws(
    () => ensureJsonSerializable({ args: [new Map([['k', 1]])] }),
    /Map/
  );
});

test('wrap sends a plain object unchanged and runs the function with it', async () => {
  const input = { amount: 100, recipient: 'alice', tags: ['a', null], nested: { n: 1 } };
  let received;
  const result = await makeClient().wrap({ functionName: 'pay' }, (arg) => {
    received = arg;
    return 'ok';
  })(input);
  assert.equal(result, 'ok');
  assert.equal(received, input);
  const create = recorded.find(
    (r) => r.url.endsWith('/v1/approvals') && r.init.method === 'POST'
  );
  assert.ok(create, 'expected a POST /v1/approvals call');
  assert.deepEqual(JSON.parse(create.init.body).arguments, input);
});

test('wrap rejects Map and Set arguments before any approval request', async () => {
  const cases = [
    new Map([['recipient', 'alice']]),
    new Set(['qa-target']),
    { targets: new Map([['recipient', 'qa-target']]) },
    { extra: { tags: new Set(['qa']) } },
    [new Set(['nested-in-array'])],
  ];
  for (const value of cases) {
    recorded = [];
    let executed = false;
    await assert.rejects(
      makeClient().wrap({ functionName: 'pay' }, () => {
        executed = true;
      })(value),
      (error) => error instanceof TypeError && /Map|Set/.test(error.message)
    );
    assert.equal(executed, false);
    assert.equal(recorded.length, 0);
  }
});

test('wrap rejects a positional Set before any approval request', async () => {
  let executed = false;
  await assert.rejects(
    makeClient().wrap({ functionName: 'pay' }, () => {
      executed = true;
    })('label', new Set(['qa-target'])),
    /Set/
  );
  assert.equal(executed, false);
  assert.equal(recorded.length, 0);
});
