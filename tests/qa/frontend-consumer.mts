// FE-002: concrete callback signatures and extra framework fields are retained.
import { gated as gateAi, gatedTools as gateAiTools } from 'sentinel-oversight/ai-sdk';
import { gated as gateAgents, gatedTools as gateAgentsTools } from 'sentinel-oversight/openai-agents';
import { gated as gateMastra } from 'sentinel-oversight/mastra';

interface TypedAiTool {
  description: string | { text: string };
  execute: (input: { amount: number }, options: { requestId: string }) => Promise<number>;
}
const aiSource: TypedAiTool = {
  description: { text: 'Transfer' },
  execute: async (input, _options) => input.amount,
};
const agentsSource = {
  invoke: async (_context: { requestId: string }, input: string) => input.length,
};
const mastraSource = {
  execute: async ({ context }: { context: { amount: number } }) => context.amount,
};
const aiTool = gateAi(aiSource);
const agentsTool = gateAgents(agentsSource);
const mastraTool = gateMastra(mastraSource);

const aiResult: Promise<number> = aiTool.execute({ amount: 1 }, { requestId: 'qa' });
const agentsResult: Promise<number> = agentsTool.invoke({ requestId: 'qa' }, '{}');
const mastraResult: Promise<number> = mastraTool.execute({ context: { amount: 1 } });
const aiDescription: TypedAiTool['description'] = aiTool.description;
const aiTools = gateAiTools({ transfer: aiSource });
const agentsTools = gateAgentsTools([agentsSource]);
const aiMapResult: Promise<number> = aiTools.transfer.execute({ amount: 1 }, { requestId: 'qa' });
const agentsArrayResult: Promise<number> = agentsTools[0]!.invoke({ requestId: 'qa' }, '{}');

// @ts-expect-error The wrapper retains the concrete input type.
aiTool.execute({ amount: 'invalid' }, { requestId: 'qa' });
// @ts-expect-error The wrapper retains the required execution context.
aiTool.execute({ amount: 1 });
// @ts-expect-error The wrapper retains the input-string requirement.
agentsTool.invoke({ requestId: 'qa' }, { amount: 1 });
// @ts-expect-error The wrapper retains Mastra's parsed context shape.
mastraTool.execute({ context: { amount: 'invalid' } });
// @ts-expect-error The tools-map helper retains concrete callback inputs.
aiTools.transfer.execute({ amount: 'invalid' }, { requestId: 'qa' });
// @ts-expect-error The tools-array helper retains concrete callback inputs.
agentsTools[0]!.invoke({ requestId: 'qa' }, { amount: 1 });

void [aiResult, agentsResult, mastraResult, aiDescription, aiMapResult, agentsArrayResult];
