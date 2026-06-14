// Unit tests for the Vercel AI SDK adapter — stubs globalThis.fetch.
// The `ai` package is NOT installed; the adapter is duck-typed, so these
// tests also prove the subpath import works without the peer dep.
//
// Run with native node test runner:  node --test tests/ai-sdk.test.mjs
import { test, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { SentinelClient, ApprovalRejected } from '../dist/index.js';
import { gated, gatedTools } from '../dist/adapters/ai-sdk.js';

const APPROVED = {
  action_id: 'act_test',
  status: 'approved',
  decision: 'approved',
};

const REJECTED = {
  action_id: 'act_test',
  status: 'rejected',
  decision: 'rejected',
  reason: 'nope',
};

const originalFetch = globalThis.fetch;
let recorded = [];
let responses = [];

beforeEach(() => {
  recorded = [];
  responses = [];
  globalThis.fetch = async (url, init = {}) => {
    recorded.push({ url: String(url), init });
    const body = responses.length > 0 ? responses.shift() : APPROVED;
    return new Response(JSON.stringify(body), { status: 200 });
  };
});

afterEach(() => {
  globalThis.fetch = originalFetch;
});

function makeClient() {
  return new SentinelClient({ apiKey: 'sk_test', apiUrl: 'https://stub.test' });
}

// Minimal AI SDK v6-shaped tool: tool({ description, inputSchema, execute })
// where execute is called as execute(input, options).
function makeTool(executeImpl) {
  return {
    description: 'Wire USD between accounts',
    inputSchema: { type: 'object' }, // opaque to the adapter
    execute: executeImpl,
  };
}

test('approved → original execute runs with original args', async () => {
  let received = null;
  const tool = makeTool(async (input, options) => {
    received = { input, options };
    return 'done';
  });

  const wrapped = gated(tool, {
    client: makeClient(),
    functionName: 'wire_transfer',
  });

  const opts = { toolCallId: 'call_1', messages: [] };
  const result = await wrapped.execute({ amount_usd: 50000, to: 'alice' }, opts);

  assert.equal(result, 'done');
  assert.deepEqual(received.input, { amount_usd: 50000, to: 'alice' });
  assert.equal(received.options, opts);

  // First request created the approval with the parsed input as arguments
  const body = JSON.parse(recorded[0].init.body);
  assert.equal(body.function_name, 'wire_transfer');
  assert.deepEqual(body.arguments, { amount_usd: 50000, to: 'alice' });
});

test('rejected → throws ApprovalRejected and never runs execute', async () => {
  responses = [REJECTED, REJECTED];
  let ran = false;
  const tool = makeTool(async () => {
    ran = true;
  });

  const wrapped = gated(tool, { client: makeClient(), functionName: 'wire' });

  await assert.rejects(
    () => wrapped.execute({ amount_usd: 1 }, { toolCallId: 'c', messages: [] }),
    ApprovalRejected
  );
  assert.equal(ran, false);
});

test('non-object input is wrapped under {input}', async () => {
  const tool = makeTool(async () => 'ok');
  const wrapped = gated(tool, { client: makeClient(), functionName: 'echo' });

  await wrapped.execute('plain string', { toolCallId: 'c', messages: [] });

  const body = JSON.parse(recorded[0].init.body);
  assert.deepEqual(body.arguments, { input: 'plain string' });
});

test('gated does not mutate the original tool', async () => {
  const original = async () => 'ok';
  const tool = makeTool(original);
  const wrapped = gated(tool, { client: makeClient(), functionName: 'x' });

  assert.equal(tool.execute, original);
  assert.notEqual(wrapped.execute, original);
  assert.equal(wrapped.description, tool.description);
  assert.equal(wrapped.inputSchema, tool.inputSchema);
});

test('gated throws on a tool without execute', () => {
  assert.throws(
    () => gated({ description: 'client-side tool' }, { client: makeClient() }),
    TypeError
  );
});

test('gatedTools uses record keys as functionName', async () => {
  const tools = gatedTools(
    {
      wire_transfer: makeTool(async () => 'wired'),
      delete_database: makeTool(async () => 'deleted'),
    },
    { client: makeClient() }
  );

  await tools.wire_transfer.execute({ amount_usd: 1 }, { toolCallId: 'c', messages: [] });
  await tools.delete_database.execute({ db: 'prod' }, { toolCallId: 'c', messages: [] });

  // Each call = 1 create + (0..n polls); first recorded body per tool is the create
  const bodies = recorded
    .filter((r) => r.init.body)
    .map((r) => JSON.parse(r.init.body));
  const names = bodies.map((b) => b.function_name);
  assert.ok(names.includes('wire_transfer'));
  assert.ok(names.includes('delete_database'));
});
