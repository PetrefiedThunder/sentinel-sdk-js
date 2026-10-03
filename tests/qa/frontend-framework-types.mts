// FE-002 additional evidence using genuine public framework tool() factories.
// Compile in an isolated consumer containing ai, @openai/agents and zod.
import { tool as aiTool, jsonSchema } from 'ai';
import { tool as agentsTool } from '@openai/agents';
import { z } from 'zod';
import { gated as gateAi } from 'sentinel-oversight/ai-sdk';
import { gated as gateAgents } from 'sentinel-oversight/openai-agents';

const ai = aiTool({
  description: 'Local counter',
  inputSchema: jsonSchema<{ amount: number }>({ type: 'object', properties: { amount: { type: 'number' } }, required: ['amount'] }),
  execute: async ({ amount }) => amount,
});
const agents = agentsTool({
  name: 'qa_counter',
  description: 'Local counter',
  parameters: z.object({ amount: z.number() }),
  execute: async ({ amount }) => amount,
});
gateAi(ai);
gateAgents(agents);
