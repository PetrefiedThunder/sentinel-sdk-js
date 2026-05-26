/**
 * LangChain.js adapter — pause every (or selected) tool call for human approval.
 *
 *   import { ChatOpenAI } from '@langchain/openai';
 *   import { createAgent, tool } from 'langchain';
 *   import { configure } from 'sentinel-oversight';
 *   import { SentinelCallbackHandler } from 'sentinel-oversight/langchain';
 *
 *   configure({ apiKey: process.env.SENTINEL_API_KEY! });
 *
 *   const agent = createAgent({ model: new ChatOpenAI(), tools: [...] });
 *
 *   await agent.invoke(
 *     { messages: [{ role: 'user', content: 'send Alice $50,000' }] },
 *     {
 *       callbacks: [
 *         new SentinelCallbackHandler({
 *           riskLevel: 'high',
 *           approvers: ['alice@acme.com'],
 *           toolAllowlist: ['wire_transfer', 'delete_database'],
 *         }),
 *       ],
 *     }
 *   );
 *
 * Semantics: in handleToolStart we create a Sentinel approval and BLOCK until
 * a human decides. On approve → LangChain proceeds with the tool call. On
 * reject or timeout → we throw, which aborts the chain.
 *
 * No hard dependency on @langchain/core — we duck-type the callback shape.
 * LangChain accepts plain objects with the right method names as callbacks,
 * so this works with @langchain/core ≥ 0.1.x without us pinning a version.
 */

import {
  ApprovalRejected,
  type OversightOptions,
  SentinelClient,
  getClient,
} from '../index.js';

export interface SentinelCallbackOptions extends OversightOptions {
  /** If set, ONLY tools whose name matches one of these get gated. Else all tools. */
  toolAllowlist?: string[];
  /** Tools to skip — useful for read-only / cheap tools you don't want to slow down. */
  toolDenylist?: string[];
  /**
   * Optional pre-built client. If omitted we use the module-level default
   * configured via configure({apiKey}). Useful for tests or multi-tenant apps.
   */
  client?: SentinelClient;
}

/**
 * Drop into any LangChain.js call as a `callbacks: []` entry. Compatible with
 * `BaseCallbackHandler` via structural typing — no langchain import required.
 */
export class SentinelCallbackHandler {
  // BaseCallbackHandler-compatible fields
  name = 'SentinelCallbackHandler';
  awaitHandlers = true; // LangChain must await us; we can't pause non-blocking
  ignoreLLM = true; // we don't gate LLM calls, only tool execution
  ignoreChain = true;
  ignoreAgent = true;
  ignoreRetriever = true;

  constructor(private readonly opts: SentinelCallbackOptions = {}) {}

  async handleToolStart(
    tool: unknown,
    input: unknown,
    _runId: string,
    _parentRunId?: string,
    _tags?: string[],
    _metadata?: Record<string, unknown>,
    runName?: string
  ): Promise<void> {
    const toolName = this.deriveName(tool, runName);

    if (this.opts.toolAllowlist && !this.opts.toolAllowlist.includes(toolName)) return;
    if (this.opts.toolDenylist?.includes(toolName)) return;

    const client = this.opts.client ?? getClient();
    const args = this.normalizeArguments(input);

    const approval = await client.createApproval({
      functionName: toolName,
      arguments: args,
      riskLevel: this.opts.riskLevel,
      approvers: this.opts.approvers,
      timeoutSeconds: this.opts.timeoutSeconds,
    });

    const decision = await client.waitForDecision(
      approval.action_id,
      this.opts.timeoutSeconds
    );

    if (decision.decision === 'rejected' || decision.status === 'rejected') {
      throw new ApprovalRejected(
        (decision.reason as string) || 'Approval rejected by Sentinel',
        approval.action_id
      );
    }
    // approved → return; LangChain proceeds to actually invoke the tool
  }

  private deriveName(tool: unknown, runName: string | undefined): string {
    if (typeof runName === 'string' && runName) return runName;
    if (tool && typeof tool === 'object') {
      const t = tool as { name?: unknown; id?: unknown };
      if (typeof t.name === 'string' && t.name) return t.name;
      if (Array.isArray(t.id) && t.id.length > 0) {
        const last = t.id[t.id.length - 1];
        if (typeof last === 'string') return last;
      }
    }
    return 'tool';
  }

  private normalizeArguments(input: unknown): Record<string, unknown> {
    // LangChain passes the tool input as a string for ReAct-style tools,
    // or as a parsed object for structured tools. The Sentinel API requires
    // `arguments` to be a dict, so wrap strings under {input: <str>}.
    if (typeof input === 'string') return { input };
    if (input && typeof input === 'object' && !Array.isArray(input)) {
      return input as Record<string, unknown>;
    }
    return { value: input };
  }
}
