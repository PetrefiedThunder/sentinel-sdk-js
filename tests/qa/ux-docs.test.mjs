import { knownDefect } from './known-defect.mjs';
import { afterEach, beforeEach, test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import ts from 'typescript';
import * as sdk from '../../dist/index.js';

// Execute the actual README blocks after replacing only their external inputs:
// an SDK import supplied as function arguments, a synthetic process.env object,
// a local fetch stub, and a payment service stub. No credential files are read.
const readme = readFileSync(new URL('../../README.md', import.meta.url), 'utf8');
const contributorGuide = readFileSync(new URL('../../CONTRIBUTING.md', import.meta.url), 'utf8');
const AsyncFunction = Object.getPrototypeOf(async function () {}).constructor;
const originalFetch = globalThis.fetch;
let requests;

function blockUnder(heading) {
  const section = readme.split(`## ${heading}\n`)[1]?.split('\n## ')[0];
  const block = section?.match(/```typescript\n([\s\S]*?)\n```/);
  assert.ok(block, `README ${heading} TypeScript block exists`);
  return block[1];
}

function program(heading, extras = {}) {
  const code = ts.transpileModule(blockUnder(heading), {
    compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext },
  }).outputText.replace(/import[\s\S]*?from ['"]sentinel-oversight['"];\s*/g, '');
  const bindings = { ...sdk, ...extras };
  return () => new AsyncFunction(...Object.keys(bindings), code)(...Object.values(bindings));
}

function decision(status = 'approved') {
  return new Response(JSON.stringify({
    action_id: 'act_ux_fixture', status, decision: status,
    reason: status === 'rejected' ? 'Review declined' : null,
  }), { status: 200 });
}

function quickstart(stripe) {
  return program('Quick start', {
    configure: (config) => sdk.configure({ ...config, apiUrl: 'http://127.0.0.1:1' }),
    process: { env: { SENTINEL_API_KEY: 'synthetic-noncredential' } },
    stripe,
  });
}

beforeEach(() => {
  requests = [];
  globalThis.fetch = async (url, init = {}) => {
    assert.equal(new URL(url).origin, 'http://127.0.0.1:1');
    requests.push({ url: String(url), body: init.body ? JSON.parse(init.body) : null });
    return decision();
  };
});

afterEach(() => { globalThis.fetch = originalFetch; });

test('README quickstart waits for a decision before calling the payment stub', async () => {
  let releaseDecision;
  let reachedWait;
  const waitEntered = new Promise((resolve) => { reachedWait = resolve; });
  const waitResponse = new Promise((resolve) => { releaseDecision = resolve; });
  const paymentCalls = [];
  globalThis.fetch = async (url, init = {}) => {
    assert.equal(new URL(url).origin, 'http://127.0.0.1:1');
    requests.push({ url: String(url), body: init.body ? JSON.parse(init.body) : null });
    if (init.method === 'POST') return decision('pending');
    reachedWait();
    return waitResponse;
  };
  const run = quickstart({ transfers: { create: async (value) => {
    paymentCalls.push(value);
    return { id: 'synthetic-receipt' };
  } } });
  const pending = run();
  await waitEntered;
  assert.deepEqual(paymentCalls, []);
  releaseDecision(decision());
  await pending;
  assert.deepEqual(paymentCalls, [{ amount: 50_000_00, destination: 'acct_acme_corp' }]);
  assert.deepEqual(requests[0].body.arguments, { args: [50_000_00, 'acct_acme_corp'] });
});

test('README quickstart rejects without calling the payment stub', async () => {
  let called = false;
  globalThis.fetch = async () => decision('rejected');
  await assert.rejects(quickstart({ transfers: { create: async () => { called = true; } } }), sdk.ApprovalRejected);
  assert.equal(called, false);
});

test('README Errors block reports documented rejected, timed-out and HTTP errors', async () => {
  for (const error of [
    new sdk.ApprovalRejected('Review declined', 'act_ux_fixture'),
    new sdk.ApprovalTimeout('act_ux_fixture', 10),
    new sdk.SentinelAPIError(422, 'Invalid approval'),
  ]) {
    const messages = [];
    await program('Errors', {
      wireTransfer: async () => { throw error; },
      console: { log: (...values) => messages.push(values) },
    })();
    assert.equal(messages.length, 1, error.name);
    assert.ok(messages[0].some((value) => String(value).length > 0));
  }
});

test('missing SDK configuration has an actionable local error', () => {
  assert.throws(() => new sdk.SentinelClient({ apiKey: '' }), {
    name: 'SentinelConfigError', message: 'configure({ apiKey }) — apiKey is required',
  });
});

test('explicit action names and synchronous return values remain usable', async () => {
  const client = new sdk.SentinelClient({ apiKey: 'synthetic-noncredential', apiUrl: 'http://127.0.0.1:1' });
  const wrapped = client.wrap({ functionName: 'quoteTotal' }, (amount) => amount * 2);
  const result = wrapped(21);
  assert.ok(result instanceof Promise);
  assert.equal(await result, 42);
  assert.equal(requests[0].body.function_name, 'quoteTotal');
});

test('public VERSION export supplies the contributor version-report workaround', () => {
  const result = spawnSync(process.execPath, [
    '--input-type=module', '-e',
    "import { VERSION } from 'sentinel-oversight'; console.log(VERSION)",
  ], { cwd: new URL('../../', import.meta.url), encoding: 'utf8' });
  assert.equal(result.status, 0, result.stderr);
  assert.equal(result.stdout.trim(), sdk.VERSION);
});

test('UX-001 README quickstart should send a recognizable action name', async () => {
  await quickstart({ transfers: { create: async () => ({ id: 'synthetic-receipt' }) } })();
  assert.equal(requests[0].body.function_name, 'wireTransfer');
});

test('UX-002 README Errors block should propagate transport failures', async () => {
  const client = new sdk.SentinelClient({ apiKey: 'synthetic-noncredential', apiUrl: 'http://127.0.0.1:1' });
  const transportError = new TypeError('Synthetic connection failure');
  globalThis.fetch = async () => { throw transportError; };
  const run = program('Errors', {
    wireTransfer: client.wrap({ functionName: 'wireTransfer' }, async () => 'unused'),
    console: { log: () => {} },
  });
  await assert.rejects(run, (error) => error === transportError);
});

test('UX-002 README Errors block should propagate the approved business operation failure', async () => {
  const client = new sdk.SentinelClient({ apiKey: 'synthetic-noncredential', apiUrl: 'http://127.0.0.1:1' });
  const operationError = new Error('Synthetic payment failure');
  const run = program('Errors', {
    wireTransfer: client.wrap({ functionName: 'wireTransfer' }, async () => { throw operationError; }),
    console: { log: () => {} },
  });
  await assert.rejects(run, (error) => error === operationError);
});

test('UX-003 documented SDK version command should complete successfully', {
  ...knownDefect('UX-003: package.json is not an exported package subpath'),
}, () => {
  const snippet = contributorGuide.match(/node -e "([^"]+)"/);
  assert.ok(snippet, 'CONTRIBUTING version-reporting command exists');
  const result = spawnSync(process.execPath, ['-e', snippet[1]], {
    cwd: new URL('../../', import.meta.url), encoding: 'utf8',
  });
  assert.equal(result.status, 0, result.stderr);
  assert.equal(result.stdout.trim(), sdk.VERSION);
});
