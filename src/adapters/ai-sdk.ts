/**
 * Vercel AI SDK adapter — gate an AI SDK `tool({...})` call behind Sentinel
 * approval.
 *
 *   import { generateText, tool } from 'ai';
 *   import { z } from 'zod';
 *   import { configure } from 'sentinel-oversight';
 *   import { gated, gatedTools } from 'sentinel-oversight/ai-sdk';
 *
 *   configure({ apiKey: process.env.SENTINEL_API_KEY! });
 *
 *   const wireTransfer = gated(
 *     tool({
 *       description: 'Wire USD between accounts',
 *       inputSchema: z.object({
 *         amount_usd: z.number(),
 *         from: z.string(),
 *         to: z.string(),
 *       }),
 *       execute: async ({ amount_usd, to }) => {
 *         return stripe.transfers.create({ amount: amount_usd * 100, destination: to });
 *       },
 *     }),
 *     { functionName: 'wire_transfer', riskLevel: 'high', approvers: ['ops@acme.com'] }
 *   );
 *
 *   await generateText({ model, tools: { wire_transfer: wireTransfer }, ... });
 *
 * Or wrap a whole tools map at once — names come from the record keys, which
 * is also the name the model sees:
 *
 *   const tools = gatedTools({ wire_transfer, delete_database }, { riskLevel: 'high' });
 *
 * Implementation: returns a new tool object with the same shape; `execute`
 * is wrapped so it pauses for approval before calling the original execute.
 * AI SDK calls `execute(input, options)` where `input` is the value parsed
 * by `inputSchema` — that's what Sentinel shows to the human approver as
 * the approval `arguments`.
 *
 * No hard dependency on the `ai` package — duck-typed against the public
 * tool shape (`description`, `inputSchema`, `execute`) so we work with any
 * AI SDK version exposing `execute(input, options)`.
 */

import {
  ApprovalRejected,
  type OversightOptions,
  SentinelClient,
  getClient,
} from '../index.js';

export interface AiSdkGateOptions extends OversightOptions {
  client?: SentinelClient;
}

interface AiSdkToolLike {
  description?: string;
  execute?: (...args: unknown[]) => unknown | Promise<unknown>;
  [key: string]: unknown;
}

export function gated<T extends AiSdkToolLike>(
  tool: T,
  opts: AiSdkGateOptions = {}
): T {
  if (typeof tool.execute !== 'function') {
    // Tools without execute() are client-executed / approval-by-other-means;
    // there is nothing for Sentinel to gate.
    throw new TypeError(
      'sentinel-oversight/ai-sdk: gated() requires a tool with an execute() function'
    );
  }

  const sentinel = opts.client ?? getClient();
  const toolName = opts.functionName ?? 'ai_sdk_tool';
  const originalExecute = tool.execute.bind(tool);

  const wrappedExecute = async (...args: unknown[]): Promise<unknown> => {
    // AI SDK calls execute(input, options). `input` is the parsed
    // inputSchema value — that's what we show to the human approver.
    const input = args[0];

    const normalized: Record<string, unknown> =
      input && typeof input === 'object' && !Array.isArray(input)
        ? (input as Record<string, unknown>)
        : { input };

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

    return originalExecute(...args);
  };

  // Return a new object with the same shape (don't mutate the original)
  return { ...tool, execute: wrappedExecute } as T;
}

/**
 * Wrap every tool in an AI SDK `tools` record. The record key is the tool
 * name the model sees, so it is also used as the Sentinel `functionName`
 * (unless overridden via opts.functionName, which would apply to all tools
 * and is therefore ignored here).
 */
export function gatedTools<T extends Record<string, AiSdkToolLike>>(
  tools: T,
  opts: AiSdkGateOptions = {}
): T {
  const out: Record<string, AiSdkToolLike> = {};
  for (const [name, tool] of Object.entries(tools)) {
    out[name] = gated(tool, { ...opts, functionName: name });
  }
  return out as T;
}
