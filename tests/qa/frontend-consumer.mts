// FE-002: ordinary explicitly typed framework callbacks must be accepted.
import { gated as gateAi } from 'sentinel-oversight/ai-sdk';
import { gated as gateAgents } from 'sentinel-oversight/openai-agents';
import { gated as gateMastra } from 'sentinel-oversight/mastra';

const aiTool = gateAi({
  execute: async (input: { amount: number }) => input.amount,
});
const agentsTool = gateAgents({
  invoke: async (_context: object, input: string) => JSON.parse(input),
});
const mastraTool = gateMastra({
  execute: async ({ context }: { context: { amount: number } }) => context.amount,
});

void aiTool;
void agentsTool;
void mastraTool;
