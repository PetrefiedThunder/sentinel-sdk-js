import { knownDefect } from './known-defect.mjs';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { pathToFileURL } from 'node:url';
import { SentinelCallbackHandler } from '../../dist/adapters/langchain.js';
import { ApprovalRejected, ApprovalTimeout } from '../../dist/index.js';

// Optional real-framework integration. The QA run installed @langchain/core
// 1.2.14 outside the repo and supplied this non-secret package-directory path.
// Default npm test skips this group when that optional dependency is absent.
let DynamicTool;
const path = process.env.SENTINEL_QA_LANGCHAIN_ROOT;
if (path) {
  // An explicit test fixture path must work; do not mask a broken installation.
  ({ DynamicTool } = await import(pathToFileURL(`${path}/dist/tools/index.js`).href));
} else {
  let installed = true;
  try { createRequire(import.meta.url).resolve('@langchain/core/tools'); }
  catch (error) {
    if (error.code !== 'MODULE_NOT_FOUND') throw error;
    installed = false;
  }
  if (installed) ({ DynamicTool } = await import('@langchain/core/tools'));
}
const optional = { skip: !DynamicTool && 'Optional @langchain/core is not installed; see FRONTEND-REPORT.md' };

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

test('FE-001 real LangChain tool requests approval before executing', { ...optional, ...knownDefect('FE-001: ignoreAgent=true skips handleToolStart completely') }, async () => {
  const { observed, invoke } = setup('approved');
  assert.equal(await invoke(), 'local-result');
  assert.equal(observed.executions, 1);
  assert.equal(observed.approvals, 1);
});

for (const decision of ['rejected', new ApprovalTimeout('qa-action', 1)]) {
  const label = typeof decision === 'string' ? 'rejection' : 'timeout';
  const ErrorClass = typeof decision === 'string' ? ApprovalRejected : ApprovalTimeout;

  test(`FE-001 real LangChain ${label} blocks execution`, { ...optional, ...knownDefect('FE-001: callback is skipped; absent raiseError also swallows errors') }, async () => {
    const { observed, invoke } = setup(decision);
    await assert.rejects(invoke, ErrorClass);
    assert.equal(observed.executions, 0);
  });

  test(`FE-001 enabling callback alone still swallows ${label}`, { ...optional, ...knownDefect('FE-001: raiseError must also be true') }, async () => {
    const { observed, invoke } = setup(decision, { ignoreAgent: false });
    await assert.rejects(invoke, ErrorClass);
    assert.equal(observed.approvals, 1);
    assert.equal(observed.executions, 0);
  });

  test(`LangChain control: callback enabled and raiseError propagates ${label}`, optional, async () => {
    const { observed, invoke } = setup(decision, { ignoreAgent: false, raiseError: true });
    await assert.rejects(invoke, ErrorClass);
    assert.equal(observed.approvals, 1);
    assert.equal(observed.executions, 0);
  });
}

test('LangChain control: callback enabled and approval allows one execution', optional, async () => {
  const { observed, invoke } = setup('approved', { ignoreAgent: false, raiseError: true });
  assert.equal(await invoke(), 'local-result');
  assert.equal(observed.approvals, 1);
  assert.equal(observed.executions, 1);
});
