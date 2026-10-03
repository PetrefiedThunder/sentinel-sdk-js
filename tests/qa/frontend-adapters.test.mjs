import { knownDefect } from './known-defect.mjs';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { ApprovalRejected, ApprovalTimeout } from '../../dist/index.js';
import { gated as gateAi, gatedTools as gateAiTools } from '../../dist/adapters/ai-sdk.js';
import { gated as gateAgents, gatedTools as gateAgentTools } from '../../dist/adapters/openai-agents.js';
import { gated as gateMastra } from '../../dist/adapters/mastra.js';
import { SentinelCallbackHandler } from '../../dist/adapters/langchain.js';

// No fetch calls: each adapter receives a local client double and synthetic data.
function stubClient(decision = { status: 'approved', decision: 'approved' }) {
  const calls = [];
  return {
    calls,
    async createApproval(options) {
      calls.push(options);
      return { action_id: 'qa-action', status: 'pending', decision: 'pending' };
    },
    async waitForDecision() {
      if (decision instanceof Error) throw decision;
      return { action_id: 'qa-action', ...decision };
    },
  };
}

const integrations = {
  ai: (client, options, action) => {
    const tool = gateAi({ execute: action }, { client, ...options });
    return () => tool.execute({ amount: 1 }, { toolCallId: 'qa-call' });
  },
  agents: (client, options, action) => {
    const tool = gateAgents({ name: 'qa_action', invoke: action }, { client, ...options });
    return () => tool.invoke({}, '{"amount":1}', { toolCall: { id: 'qa-call' } });
  },
  mastra: (client, options, action) => {
    const tool = gateMastra({ id: 'qa_action', execute: action }, { client, ...options });
    return () => tool.execute({ context: { amount: 1 } });
  },
  langchain: (client, options, action) => {
    const handler = new SentinelCallbackHandler({ client, ...options });
    return async () => {
      await handler.handleToolStart({ name: 'qa_action' }, { amount: 1 }, 'qa-run');
      return action();
    };
  },
};

for (const [name, build] of Object.entries(integrations)) {
  test(`${name}: approval runs action exactly once and passes options`, async () => {
    const client = stubClient();
    let executions = 0;
    const invoke = build(client, { riskLevel: 'critical', approvers: ['qa@example.invalid'], timeoutSeconds: 5 }, () => ++executions);
    assert.equal(await invoke(), 1);
    assert.equal(executions, 1);
    assert.deepEqual(client.calls[0].arguments, { amount: 1 });
    assert.equal(client.calls[0].riskLevel, 'critical');
    assert.equal(client.calls[0].timeoutSeconds, 5);
  });

  for (const [state, decision] of [
    ['reject', { status: 'rejected', decision: 'rejected', reason: 'QA rejected' }],
    ['timeout', new ApprovalTimeout('qa-action', 5)],
    ['transport error', new Error('synthetic transport failure')],
  ]) {
    test(`${name}: ${state} prevents direct action execution`, async () => {
      const client = stubClient(decision);
      let executions = 0;
      const invoke = build(client, {}, () => ++executions);
      await assert.rejects(invoke, state === 'reject' ? ApprovalRejected : decision.constructor);
      assert.equal(executions, 0);
    });
  }

  for (const key of ['qa-stable', () => 'qa-generated']) {
    test(`FE-003 ${name}: forwards ${typeof key} idempotency key`, { ...knownDefect('FE-003: adapters omit the declared idempotencyKey option') }, async () => {
      const client = stubClient();
      await build(client, { idempotencyKey: key }, () => 'ok')();
      assert.equal(client.calls[0].idempotencyKey, typeof key === 'function' ? 'qa-generated' : key);
    });
  }
}

test('Mastra preserves tool binding, input, execution context and return value', async () => {
  const client = stubClient();
  const input = { context: { amount: 2 }, runtimeContext: { request: 'qa' } };
  const options = { signal: new AbortController().signal };
  const original = {
    id: 'qa_binding',
    execute(first, second) {
      assert.equal(this, original);
      assert.equal(first, input);
      assert.equal(second, options);
      return 'ok';
    },
  };
  const wrapped = gateMastra(original, { client });
  assert.notEqual(wrapped.execute, original.execute);
  assert.equal(await wrapped.execute(input, options), 'ok');
  assert.deepEqual(client.calls[0].arguments, { amount: 2 });
});

test('LangChain allowlist and denylist select tools before creating approvals', async () => {
  const client = stubClient();
  const handler = new SentinelCallbackHandler({ client, toolAllowlist: ['write', 'skip'], toolDenylist: ['skip'] });
  for (const name of ['read', 'write', 'skip']) {
    await handler.handleToolStart({ name }, { name }, 'qa-run');
  }
  assert.deepEqual(client.calls.map((call) => call.functionName), ['write']);
});

test('LangChain names prefer runName, then name, then serialized id, then fallback', async () => {
  const client = stubClient();
  const handler = new SentinelCallbackHandler({ client });
  for (const [tool, runName] of [[{ name: 'tool-name' }, 'run-name'], [{ name: 'tool-name' }], [{ id: ['module', 'serialized-name'] }], [null]]) {
    await handler.handleToolStart(tool, 'input', 'qa-run', undefined, undefined, undefined, runName);
  }
  assert.deepEqual(client.calls.map((call) => call.functionName), ['run-name', 'tool-name', 'serialized-name', 'tool']);
  assert.ok(client.calls.every((call) => call.arguments.input === 'input'));
});

test('Tools-map helpers preserve distinct tool names', async () => {
  const client = stubClient();
  const tools = gateAiTools({ first: { execute() {} }, second: { execute() {} } }, { client, functionName: 'ignored' });
  await tools.first.execute({});
  await tools.second.execute({});
  const agents = gateAgentTools([{ name: 'third', invoke() {} }, { name: 'fourth', invoke() {} }], { client, functionName: 'ignored' });
  for (const tool of agents) await tool.invoke({}, '{}');
  assert.deepEqual(client.calls.map((call) => call.functionName), ['first', 'second', 'third', 'fourth']);
});

function compile(file) {
  const root = fileURLToPath(new URL('../../', import.meta.url));
  return spawnSync(process.execPath, ['node_modules/typescript/bin/tsc', '--noEmit', '--strict', '--skipLibCheck', '--target', 'ES2022', '--module', 'NodeNext', '--moduleResolution', 'NodeNext', `tests/qa/${file}`], { cwd: root, encoding: 'utf8' });
}

test('Package subpaths resolve in a strict NodeNext TypeScript consumer', () => {
  const result = compile('frontend-consumer-control.mts');
  assert.equal(result.status, 0, result.stdout + result.stderr);
});

test('FE-002 adapters accept explicitly typed callbacks in a strict consumer', () => {
  const result = compile('frontend-consumer.mts');
  assert.equal(result.status, 0, result.stdout + result.stderr);
});
