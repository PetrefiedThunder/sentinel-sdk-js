/**
 * OpenAI Agents (JS/TS) adapter — gate an `@openai/agents` `tool({...})`
 * call behind Sentinel approval.
 *
 *   import { Agent, run, tool } from '@openai/agents';
 *   import { z } from 'zod';
 *   import { configure } from 'sentinel-oversight';
 *   import { gated, gatedTools } from 'sentinel-oversight/openai-agents';
 *
 *   configure({ apiKey: process.env.SENTINEL_API_KEY! });
 *
 *   const wireTransfer = gated(
 *     tool({
 *       name: 'wire_transfer',
 *       description: 'Wire USD between accounts',
 *       parameters: z.object({
 *         amount_usd: z.number(),
 *         from: z.string(),
 *         to: z.string(),
 *       }),
 *       execute: async ({ amount_usd, to }) => {
 *         return stripe.transfers.create({ amount: amount_usd * 100, destination: to });
 *       },
 *     }),
 *     { riskLevel: 'high', approvers: ['ops@acme.com'] }
 *   );
 *
 *   const agent = new Agent({ name: 'Banker', tools: [wireTransfer] });
 *   await run(agent, 'wire Alice $50,000');
 *
 * Or wrap several tools at once — each keeps its own `name`, which is also
 * the Sentinel `functionName`:
 *
 *   const tools = gatedTools([wireTransfer, deleteDatabase], { riskLevel: 'high' });
 *
 * Implementation: the object returned by `tool()` is a FunctionTool whose
 * `invoke(runContext, input, details)` is the SDK's tool-execution entry —
 * `input` is the raw JSON-string of arguments the model produced. We return
 * a new tool with the same shape whose `invoke` is wrapped so it pauses for
 * approval (showing the parsed arguments to the human) before delegating to
 * the original `invoke`.
 *
 * No hard dependency on @openai/agents — duck-typed against the public
 * FunctionTool shape (`name`, `invoke`) so we work with any version exposing
 * `invoke(runContext, input, details)`.
 */

import {
  ApprovalRejected,
  type OversightOptions,
  SentinelClient,
  getClient,
} from '../index.js';

export interface OpenAiAgentsGateOptions extends OversightOptions {
  client?: SentinelClient;
}

interface FunctionToolLike {
  name?: string;
  description?: string;
  invoke: (...args: unknown[]) => unknown | Promise<unknown>;
  [key: string]: unknown;
}

export function gated<T extends FunctionToolLike>(
  tool: T,
  opts: OpenAiAgentsGateOptions = {}
): T {
  if (typeof tool.invoke !== 'function') {
    // Only function tools (created via tool({...})) have invoke(); hosted /
    // built-in tools are executed server-side and can't be gated here.
    throw new TypeError(
      'sentinel-oversight/openai-agents: gated() requires a function tool with an invoke() method'
    );
  }

  const sentinel = opts.client ?? getClient();
  const toolName = opts.functionName ?? tool.name ?? 'openai_agents_tool';
  const originalInvoke = tool.invoke.bind(tool);

  const wrappedInvoke = async (...args: unknown[]): Promise<unknown> => {
    // The SDK calls invoke(runContext, input, details) where `input` is the
    // raw JSON-string of arguments the model produced. Parse it to a plain
    // object so the human approver sees structured arguments.
    const rawInput = args[1];
    const normalized = normalizeArguments(rawInput);

    const approval = await sentinel.createApproval({
      functionName: toolName,
      arguments: normalized,
      riskLevel: opts.riskLevel,
      approvers: opts.approvers,
      timeoutSeconds: opts.timeoutSeconds,
    });

    const decision = await sentinel.waitForDecision(
      approval.action_id,
      opts.timeoutSeconds
    );

    if (decision.decision === 'rejected' || decision.status === 'rejected') {
      throw new ApprovalRejected(
        (decision.reason as string) || 'Approval rejected by Sentinel',
        approval.action_id
      );
    }

    return originalInvoke(...args);
  };

  // Return a new object with the same shape (don't mutate the original)
  return { ...tool, invoke: wrappedInvoke } as T;
}

function normalizeArguments(rawInput: unknown): Record<string, unknown> {
  // invoke receives `input` as a JSON string. Parse it; if it decodes to a
  // plain object that's the arguments dict. Anything else (array, scalar, or
  // unparseable) is wrapped so the Sentinel API always receives an object.
  if (typeof rawInput === 'string') {
    try {
      const parsed: unknown = JSON.parse(rawInput);
      if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
        return parsed as Record<string, unknown>;
      }
      return { input: parsed };
    } catch {
      return { input: rawInput };
    }
  }
  if (rawInput && typeof rawInput === 'object' && !Array.isArray(rawInput)) {
    return rawInput as Record<string, unknown>;
  }
  return { input: rawInput };
}

/**
 * Wrap every tool in an `@openai/agents` tools array. Each tool keeps its own
 * `name`, which is the name the model sees, so it is used as the Sentinel
 * `functionName` (opts.functionName, which would apply to all tools, is
 * therefore ignored here).
 */
export function gatedTools<T extends FunctionToolLike>(
  tools: T[],
  opts: OpenAiAgentsGateOptions = {}
): T[] {
  return tools.map((tool) =>
    gated(tool, { ...opts, functionName: undefined })
  );
}
