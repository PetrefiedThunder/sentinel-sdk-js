/**
 * Mastra adapter — gate a Mastra `createTool({...})` call behind Sentinel approval.
 *
 *   import { createTool } from '@mastra/core/tools';
 *   import { z } from 'zod';
 *   import { configure } from 'sentinel-oversight';
 *   import { gated } from 'sentinel-oversight/mastra';
 *
 *   configure({ apiKey: process.env.SENTINEL_API_KEY! });
 *
 *   const wireTransfer = gated(
 *     createTool({
 *       id: 'wire_transfer',
 *       description: 'Wire USD between accounts',
 *       inputSchema: z.object({
 *         amount_usd: z.number(),
 *         from: z.string(),
 *         to: z.string(),
 *       }),
 *       execute: async ({ context }) => {
 *         return stripe.transfers.create({ amount: context.amount_usd * 100, destination: context.to });
 *       },
 *     }),
 *     { riskLevel: 'high', approvers: ['ops@acme.com'] }
 *   );
 *
 * Implementation: returns a new tool object with the same shape; the
 * `execute` function is wrapped so it pauses for approval before calling
 * the original execute. Sentinel sees the resolved `context` (parsed
 * input) as the approval `arguments`.
 *
 * No hard dependency on @mastra/core — duck-typed against the public
 * tool shape so we work with any version exposing `id` and `execute`.
 */

import {
  ApprovalRejected,
  type OversightOptions,
  SentinelClient,
  getClient,
} from '../index.js';

export interface MastraGateOptions extends OversightOptions {
  client?: SentinelClient;
}

interface MastraToolLike {
  id?: string;
  description?: string;
  execute: (...args: unknown[]) => unknown | Promise<unknown>;
  [key: string]: unknown;
}

export function gated<T extends MastraToolLike>(
  tool: T,
  opts: MastraGateOptions = {}
): T {
  const sentinel = opts.client ?? getClient();
  const toolName = opts.functionName ?? tool.id ?? 'mastra_tool';
  const originalExecute = tool.execute.bind(tool);

  const wrappedExecute = async (...args: unknown[]): Promise<unknown> => {
    // Mastra passes a single object: { context, runtimeContext, ... }.
    // The `context` field is the parsed inputSchema — that's what we want
    // shown to the human approver.
    const first = args[0];
    const ctx =
      first &&
      typeof first === 'object' &&
      'context' in (first as Record<string, unknown>)
        ? (first as { context: unknown }).context
        : first;

    const normalized: Record<string, unknown> =
      ctx && typeof ctx === 'object' && !Array.isArray(ctx)
        ? (ctx as Record<string, unknown>)
        : { input: ctx };

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
