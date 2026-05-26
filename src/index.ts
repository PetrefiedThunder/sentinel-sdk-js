/**
 * Sentinel SDK for JavaScript / TypeScript.
 *
 *   import { configure, oversight } from 'sentinel-oversight';
 *
 *   configure({ apiKey: process.env.SENTINEL_API_KEY! });
 *
 *   const wireTransfer = oversight(
 *     { riskLevel: 'high', approvers: ['alice@acme.com'] },
 *     async (amount: number, recipient: string) => {
 *       return stripe.transfers.create({ amount, destination: recipient });
 *     }
 *   );
 *
 *   await wireTransfer(50_000, 'acct_xyz');   // pauses until approved
 *
 * Mirrors the Python SDK (sentinel-oversight on PyPI) including the 0.1.8
 * client-side JSON-serializability check.
 */

export const VERSION = '0.1.0';
const USER_AGENT = `sentinel-sdk-js/${VERSION}`;
const DEFAULT_API_URL = 'https://api.pauseapi.app';

// ── Types ──────────────────────────────────────────────────────────
export type RiskLevel = 'low' | 'medium' | 'high' | 'critical';

export interface SentinelConfig {
  apiKey: string;
  apiUrl?: string;
  timeoutSeconds?: number;
}

export interface OversightOptions {
  riskLevel?: RiskLevel;
  approvers?: string[];
  timeoutSeconds?: number;
  /** Override the function-name shown to approvers (defaults to fn.name). */
  functionName?: string;
}

export interface ApprovalRecord {
  action_id: string;
  status: 'pending' | 'approved' | 'rejected';
  decision: 'pending' | 'approved' | 'rejected';
  reason?: string | null;
  decided_by?: string | null;
  decided_at?: string | null;
  [key: string]: unknown;
}

// ── Errors ─────────────────────────────────────────────────────────
export class SentinelError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'SentinelError';
  }
}

export class SentinelConfigError extends SentinelError {
  constructor(message: string) {
    super(message);
    this.name = 'SentinelConfigError';
  }
}

export class SentinelAPIError extends SentinelError {
  constructor(
    public readonly statusCode: number,
    message: string,
    public readonly url?: string
  ) {
    super(`[${statusCode}] ${message}`);
    this.name = 'SentinelAPIError';
  }
}

export class ApprovalRejected extends SentinelError {
  constructor(
    public readonly reason: string,
    public readonly actionId: string
  ) {
    super(reason || 'Approval rejected');
    this.name = 'ApprovalRejected';
  }
}

export class ApprovalTimeout extends SentinelError {
  constructor(
    public readonly actionId: string,
    public readonly timeoutSeconds: number
  ) {
    super(`Approval timed out after ${timeoutSeconds}s`);
    this.name = 'ApprovalTimeout';
  }
}

// ── Helpers ────────────────────────────────────────────────────────
/** Fail-fast if args can't be JSON-encoded. Mirrors Python SDK 0.1.8 fix. */
export function ensureJsonSerializable(value: unknown): void {
  try {
    JSON.stringify(value);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    throw new TypeError(
      `oversight arguments must be JSON-serializable. Got: ${msg}. ` +
        `Convert Maps/Sets/BigInts/circular refs/class instances to plain ` +
        `objects/arrays/strings/numbers/booleans/null before the call.`
    );
  }
}

// ── Client ─────────────────────────────────────────────────────────
export class SentinelClient {
  private readonly apiKey: string;
  private readonly apiUrl: string;
  private readonly defaultTimeoutSeconds: number;

  constructor(config: SentinelConfig) {
    if (!config.apiKey) {
      throw new SentinelConfigError(
        'configure({ apiKey }) — apiKey is required'
      );
    }
    this.apiKey = config.apiKey;
    this.apiUrl = (config.apiUrl ?? DEFAULT_API_URL).replace(/\/$/, '');
    this.defaultTimeoutSeconds = config.timeoutSeconds ?? 300;
  }

  // ---- low-level HTTP ----
  private async request<T = unknown>(
    path: string,
    init: RequestInit = {}
  ): Promise<T> {
    const url = `${this.apiUrl}${path}`;
    const r = await fetch(url, {
      ...init,
      headers: {
        'User-Agent': USER_AGENT,
        'Content-Type': 'application/json',
        Authorization: `Bearer ${this.apiKey}`,
        ...(init.headers ?? {}),
      },
    });
    if (!r.ok) {
      let detail = '';
      try {
        const body = (await r.json()) as Record<string, unknown>;
        const rawDetail = body['detail'] ?? body['message'] ?? body;
        detail =
          typeof rawDetail === 'string' ? rawDetail : JSON.stringify(rawDetail);
      } catch {
        const txt = await r.text().catch(() => '');
        detail = txt.slice(0, 500);
      }
      throw new SentinelAPIError(r.status, detail, url);
    }
    return (await r.json()) as T;
  }

  // ---- approvals ----
  async createApproval(opts: {
    functionName: string;
    arguments: unknown;
    riskLevel?: RiskLevel;
    approvers?: string[];
    timeoutSeconds?: number;
  }): Promise<ApprovalRecord> {
    ensureJsonSerializable(opts.arguments);
    return this.request<ApprovalRecord>('/v1/approvals', {
      method: 'POST',
      body: JSON.stringify({
        function_name: opts.functionName,
        arguments: opts.arguments,
        risk_level: opts.riskLevel ?? 'medium',
        approvers: opts.approvers ?? [],
        timeout_seconds: opts.timeoutSeconds ?? this.defaultTimeoutSeconds,
      }),
    });
  }

  async getApproval(actionId: string): Promise<ApprovalRecord> {
    return this.request<ApprovalRecord>(
      `/v1/approvals/${encodeURIComponent(actionId)}`
    );
  }

  /**
   * Block until the approval is decided or the timeout elapses. Uses the
   * server-side long-poll endpoint when available (single RTT per ~30 s
   * window via Postgres LISTEN/NOTIFY); falls back to plain polling on older
   * servers that don't have /wait.
   */
  async waitForDecision(
    actionId: string,
    timeoutSeconds?: number
  ): Promise<ApprovalRecord> {
    const timeout = timeoutSeconds ?? this.defaultTimeoutSeconds;
    const deadline = Date.now() + timeout * 1000;
    while (true) {
      const remaining = Math.max(
        1,
        Math.min(30, Math.floor((deadline - Date.now()) / 1000))
      );
      let data: ApprovalRecord;
      try {
        data = await this.request<ApprovalRecord>(
          `/v1/approvals/${encodeURIComponent(actionId)}/wait?timeout=${remaining}`
        );
      } catch (e) {
        if (e instanceof SentinelAPIError && e.statusCode === 404) {
          data = await this.getApproval(actionId);
        } else {
          throw e;
        }
      }
      const status = data.status ?? data.decision;
      if (status === 'approved' || status === 'rejected') return data;
      if (Date.now() >= deadline) {
        throw new ApprovalTimeout(actionId, timeout);
      }
    }
  }

  // ---- tenant ----
  async getTenant(): Promise<Record<string, unknown>> {
    return this.request('/v1/tenants/me');
  }

  async setDefaultApprovers(
    approvers: string[]
  ): Promise<Record<string, unknown>> {
    return this.request('/v1/tenants/me', {
      method: 'PATCH',
      body: JSON.stringify({ default_approvers: approvers }),
    });
  }

  // ---- audit ----
  async listAuditEvents(actionId?: string): Promise<unknown[]> {
    const qs = actionId
      ? `?action_id=${encodeURIComponent(actionId)}`
      : '';
    return this.request<unknown[]>(`/v1/audit-events${qs}`);
  }

  // ---- the decorator surface ----
  /**
   * Wrap a function so each call pauses for human approval before executing.
   *
   *   const safeRefund = client.wrap(
   *     { riskLevel: 'critical', approvers: ['alice@acme.com'] },
   *     async (chargeId: string) => stripe.refunds.create({ charge: chargeId })
   *   );
   *
   *   await safeRefund('ch_abc123');
   *
   * On approval the wrapped fn runs with the original arguments and its
   * return value flows back to the caller. On rejection → ApprovalRejected.
   * On timeout → ApprovalTimeout.
   */
  wrap<Args extends unknown[], R>(
    opts: OversightOptions,
    fn: (...args: Args) => Promise<R> | R
  ): (...args: Args) => Promise<R> {
    const fnName = opts.functionName || fn.name || 'anonymous';
    return async (...args: Args): Promise<R> => {
      // API requires `arguments` be a JSON object (dict). Two ergonomic
      // shapes: if the caller passes exactly one plain-object arg, that
      // object IS the arguments (named-style). Otherwise wrap positional
      // args under `{ args: [...] }`.
      const isPlainObject =
        args.length === 1 &&
        args[0] !== null &&
        typeof args[0] === 'object' &&
        !Array.isArray(args[0]);
      const callArgs: Record<string, unknown> = isPlainObject
        ? (args[0] as Record<string, unknown>)
        : { args: args as unknown[] };
      const approval = await this.createApproval({
        functionName: fnName,
        arguments: callArgs,
        riskLevel: opts.riskLevel,
        approvers: opts.approvers,
        timeoutSeconds: opts.timeoutSeconds,
      });
      const decision = await this.waitForDecision(
        approval.action_id,
        opts.timeoutSeconds
      );
      if (decision.decision === 'rejected' || decision.status === 'rejected') {
        throw new ApprovalRejected(
          (decision.reason as string) || 'Approval rejected',
          approval.action_id
        );
      }
      return await fn(...args);
    };
  }
}

// ── Module-level convenience: configure() + oversight() ────────────
let _defaultClient: SentinelClient | null = null;

export function configure(config: SentinelConfig): SentinelClient {
  _defaultClient = new SentinelClient(config);
  return _defaultClient;
}

export function getClient(): SentinelClient {
  if (!_defaultClient) {
    throw new SentinelConfigError(
      'Call configure({ apiKey: ... }) before using oversight()'
    );
  }
  return _defaultClient;
}

export function oversight<Args extends unknown[], R>(
  opts: OversightOptions,
  fn: (...args: Args) => Promise<R> | R
): (...args: Args) => Promise<R> {
  return getClient().wrap(opts, fn);
}
