// Run from an isolated consumer containing ai, @openai/agents and zod.
// This probe only calls local tool factories/functions, never model providers.
import assert from 'node:assert/strict';
import { tool as aiTool, jsonSchema } from 'ai';
import { tool as agentsTool, RunContext } from '@openai/agents';
import { z } from 'zod';
import { ApprovalRejected } from 'sentinel-oversight';
import { gated as gateAi } from 'sentinel-oversight/ai-sdk';
import { gated as gateAgents } from 'sentinel-oversight/openai-agents';

for (const decision of ['approved', 'rejected']) {
  const calls = [];
  let executions = 0;
  const client = {
    async createApproval(options) { calls.push(options); return { action_id: 'qa-action' }; },
    async waitForDecision() { return { action_id: 'qa-action', status: decision, decision }; },
  };
  const input = { amount: 7 };
  const ai = gateAi(aiTool({
    description: 'Local counter',
    inputSchema: jsonSchema({ type: 'object', properties: { amount: { type: 'number' } }, required: ['amount'] }),
    execute: async ({ amount }) => { executions++; return amount; },
  }), { client, functionName: 'qa_ai' });
  const agents = gateAgents(agentsTool({
    name: 'qa_agents',
    description: 'Local counter',
    parameters: z.object({ amount: z.number() }),
    execute: async ({ amount }) => { executions++; return amount; },
  }), { client });
  const operations = [
    () => ai.execute(input, { toolCallId: 'qa-call', messages: [] }),
    () => agents.invoke(new RunContext(), JSON.stringify(input)),
  ];
  for (const operation of operations) {
    if (decision === 'approved') assert.equal(Number(await operation()), 7);
    else await assert.rejects(operation, ApprovalRejected);
  }
  assert.equal(executions, decision === 'approved' ? 2 : 0);
  assert.deepEqual(calls.map((call) => call.arguments), [input, input]);
  console.log(JSON.stringify({ decision, approvals: calls.length, executions, result: 'PASS' }));
}
