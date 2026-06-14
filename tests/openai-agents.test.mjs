// Unit tests for the OpenAI Agents (JS/TS) adapter — stubs globalThis.fetch.
// The `@openai/agents` package is NOT installed; the adapter is duck-typed, so
// these tests also prove the subpath import works without the peer dep.
//
// Run with native node test runner:  node --test tests/openai-agents.test.mjs
import { test, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { SentinelClient, ApprovalRejected } from '../dist/index.js';
import { gated, gatedTools } from '../dist/adapters/openai-agents.js';

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

// Minimal @openai/agents FunctionTool: the object returned by tool({...}).
// The SDK calls invoke(runContext, input, details) where `input` is the raw
// JSON-string of the arguments the model produced.
function makeTool(name, invokeImpl) {
  return {
    type: 'function',
    name,
    description: 'Wire USD between accounts',
    parameters: { type: 'object' }, // opaque to the adapter
    strict: true,
    invoke: invokeImpl,
  };
}

test('approved → original invoke runs with original args', async () => {
  let received = null;
  const tool = makeTool('wire_transfer', async (runContext, input, details) => {
    received = { runContext, input, details };
    return 'done';
  });

  const wrapped = gated(tool, { client: makeClient() });

  const runContext = { context: {} };
  const input = JSON.stringify({ amount_usd: 50000, to: 'alice' });
  const details = { toolCall: { id: 'call_1' } };
  const result = await wrapped.invoke(runContext, input, details);

  assert.equal(result, 'done');
  assert.equal(received.runContext, runContext);
  assert.equal(received.input, input);
  assert.equal(received.details, details);

  // First request created the approval with the parsed JSON-string arguments,
  // and the tool's own name is used as function_name.
  const body = JSON.parse(recorded[0].init.body);
  assert.equal(body.function_name, 'wire_transfer');
  assert.deepEqual(body.arguments, { amount_usd: 50000, to: 'alice' });
});

test('rejected → throws ApprovalRejected and never runs invoke', async () => {
  responses = [REJECTED, REJECTED];
  let ran = false;
  const tool = makeTool('wire', async () => {
    ran = true;
  });

  const wrapped = gated(tool, { client: makeClient() });

  await assert.rejects(
    () => wrapped.invoke({}, JSON.stringify({ amount_usd: 1 }), {}),
    ApprovalRejected
  );
  assert.equal(ran, false);
});

test('functionName overrides the tool name', async () => {
  const tool = makeTool('wire', async () => 'ok');
  const wrapped = gated(tool, { client: makeClient(), functionName: 'custom_name' });

  await wrapped.invoke({}, JSON.stringify({ a: 1 }), {});

  const body = JSON.parse(recorded[0].init.body);
  assert.equal(body.function_name, 'custom_name');
});

test('non-JSON-object input is wrapped under {input}', async () => {
  const tool = makeTool('echo', async () => 'ok');
  const wrapped = gated(tool, { client: makeClient() });

  // A plain (non-JSON) string can't be parsed to an object → wrap it.
  await wrapped.invoke({}, 'plain string', {});

  const body = JSON.parse(recorded[0].init.body);
  assert.deepEqual(body.arguments, { input: 'plain string' });
});

test('gated does not mutate the original tool', async () => {
  const original = async () => 'ok';
  const tool = makeTool('x', original);
  const wrapped = gated(tool, { client: makeClient() });

  assert.equal(tool.invoke, original);
  assert.notEqual(wrapped.invoke, original);
  assert.equal(wrapped.name, tool.name);
  assert.equal(wrapped.description, tool.description);
  assert.equal(wrapped.parameters, tool.parameters);
});

test('gated throws on a tool without invoke', () => {
  assert.throws(
    () => gated({ type: 'function', name: 'hosted' }, { client: makeClient() }),
    TypeError
  );
});

test('gatedTools wraps each tool and keeps its own name', async () => {
  const tools = gatedTools(
    [
      makeTool('wire_transfer', async () => 'wired'),
      makeTool('delete_database', async () => 'deleted'),
    ],
    { client: makeClient() }
  );

  await tools[0].invoke({}, JSON.stringify({ amount_usd: 1 }), {});
  await tools[1].invoke({}, JSON.stringify({ db: 'prod' }), {});

  const bodies = recorded
    .filter((r) => r.init.body)
    .map((r) => JSON.parse(r.init.body));
  const names = bodies.map((b) => b.function_name);
  assert.ok(names.includes('wire_transfer'));
  assert.ok(names.includes('delete_database'));
});
