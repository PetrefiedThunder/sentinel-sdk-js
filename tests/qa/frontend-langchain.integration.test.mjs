import { test, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { webcrypto } from 'node:crypto';
import { pathToFileURL } from 'node:url';
import { SentinelCallbackHandler } from '../../dist/adapters/langchain.js';
import { ApprovalRejected, ApprovalTimeout, SentinelClient, SentinelError, SentinelAPIError } from '../../dist/index.js';

// LangChain 1.2.14 targets Node 20+. Its UUID generator needs global WebCrypto;
// use the same native implementation when exercising SDK compatibility on 18.
globalThis.crypto ??= webcrypto;

// Required real-framework regression: @langchain/core is a pinned dev dependency.
// The optional path selects a locally installed compatibility-test version.
let DynamicTool;
const path = process.env.SENTINEL_QA_LANGCHAIN_ROOT;
if (path) {
  // An explicit test fixture path must work; do not mask a broken installation.
  ({ DynamicTool } = await import(pathToFileURL(`${path}/dist/tools/index.js`).href));
} else {
  ({ DynamicTool } = await import('@langchain/core/tools'));
}

function setup(decision, overrides = {}) {
  const observed = { approvals: 0, executions: 0 };
  const handler = new SentinelCallbackHandler({
    client: {
      async createApproval() {
        observed.approvals++;
        return { action_id: 'qa-action' };
      },
      async waitForDecision() {
        if (decision instanceof Error) throw decision;
        return { action_id: 'qa-action', status: decision, decision };
      },
    },
  });
  Object.assign(handler, overrides);
  const tool = new DynamicTool({
    name: 'qa_action',
    description: 'Synthetic local counter; no service calls',
    func: async () => {
      observed.executions++;
      return 'local-result';
    },
  });
  return { observed, invoke: () => tool.invoke('synthetic input', { callbacks: [handler] }) };
}

test('FE-001 real LangChain tool requests approval before executing', async () => {
  const { observed, invoke } = setup('approved');
  assert.equal(await invoke(), 'local-result');
  assert.equal(observed.executions, 1);
  assert.equal(observed.approvals, 1);
});

for (const decision of ['rejected', new ApprovalTimeout('qa-action', 1)]) {
  const label = typeof decision === 'string' ? 'rejection' : 'timeout';
  const ErrorClass = typeof decision === 'string' ? ApprovalRejected : ApprovalTimeout;

  test(`FE-001 real LangChain ${label} blocks execution`, async () => {
    const { observed, invoke } = setup(decision);
    await assert.rejects(invoke, ErrorClass);
    assert.equal(observed.executions, 0);
  });

  test(`FE-001 enabled callback propagates ${label}`, async () => {
    const { observed, invoke } = setup(decision, { ignoreAgent: false });
    await assert.rejects(invoke, ErrorClass);
    assert.equal(observed.approvals, 1);
    assert.equal(observed.executions, 0);
  });

  test(`LangChain control: callback enabled and raiseError propagates ${label}`, async () => {
    const { observed, invoke } = setup(decision, { ignoreAgent: false, raiseError: true });
    await assert.rejects(invoke, ErrorClass);
    assert.equal(observed.approvals, 1);
    assert.equal(observed.executions, 0);
  });
}

test('LangChain control: callback enabled and approval allows one execution', async () => {
  const { observed, invoke } = setup('approved', { ignoreAgent: false, raiseError: true });
  assert.equal(await invoke(), 'local-result');
  assert.equal(observed.approvals, 1);
  assert.equal(observed.executions, 1);
});

for (const decision of [undefined, null, 'pending', 'unexpected']) {
  test(`FE-001 missing or nonterminal approval (${decision}) blocks execution`, async () => {
    const { observed, invoke } = setup(decision);
    await assert.rejects(invoke, SentinelError);
    assert.equal(observed.executions, 0);
  });
}

const originalFetch = globalThis.fetch;
afterEach(() => { globalThis.fetch = originalFetch; });

for (const stage of ['creation', 'decision']) {
  for (const failure of ['network', 'malformed JSON', 'missing action ID', 'HTTP 403', 'HTTP 503']) {
    test(`FE-001 real LangChain ${stage} ${failure} blocks execution`, async () => {
      let executions = 0;
      let requests = 0;
      globalThis.fetch = async (_url, init) => {
        requests++;
        if (stage === 'decision' && init.method === 'POST') {
          return Response.json({ action_id: 'qa-action', status: 'pending', decision: 'pending' });
        }
        if (failure === 'network') throw new TypeError('Synthetic network failure');
        if (failure === 'malformed JSON') return new Response('not JSON');
        if (failure === 'missing action ID') return Response.json({ status: 'approved', decision: 'approved' });
        return Response.json({ detail: 'Synthetic HTTP error' }, { status: Number(failure.slice(5)) });
      };
      const handler = new SentinelCallbackHandler({
        client: new SentinelClient({ apiKey: 'qa-synthetic', apiUrl: 'http://127.0.0.1:1' }),
      });
      const tool = new DynamicTool({
        name: 'qa_action', description: 'Local counter',
        func: async () => { executions++; return 'local-result'; },
      });
      const ErrorClass = failure === 'network' ? TypeError
        : failure === 'malformed JSON' ? SyntaxError
        : failure === 'missing action ID' ? SentinelError : SentinelAPIError;
      await assert.rejects(() => tool.invoke('input', { callbacks: [handler] }), ErrorClass);
      assert.equal(requests, stage === 'creation' ? 1 : 2);
      assert.equal(executions, 0);
    });
  }
}

for (const stage of ['creation', 'decision']) {
  test(`BE-002 real LangChain stalled ${stage} times out without execution`, async () => {
    let executions = 0;
    let release;
    let signal;
    globalThis.fetch = async (_url, init) => {
      if (stage === 'decision' && init.method === 'POST') {
        return Response.json({ action_id: 'qa-action', status: 'pending', decision: 'pending' });
      }
      signal = init.signal;
      return new Promise((resolve) => {
        release = () => resolve(Response.json({ action_id: 'qa-action', status: 'approved', decision: 'approved' }));
      });
    };
    const handler = new SentinelCallbackHandler({
      timeoutSeconds: 0.015,
      client: new SentinelClient({ apiKey: 'qa-synthetic', apiUrl: 'http://127.0.0.1:1' }),
    });
    const tool = new DynamicTool({
      name: 'qa_action', description: 'Local counter',
      func: async () => { executions++; return 'local-result'; },
    });
    await assert.rejects(() => tool.invoke('input', { callbacks: [handler] }), ApprovalTimeout);
    assert.equal(signal.aborted, true);
    release();
    await new Promise((resolve) => setImmediate(resolve));
    assert.equal(executions, 0);
  });
}
