Start: 2026-10-03T01:41:13+00:00
End: 2026-10-03T01:41:13+00:00
Command: rg -n -C 7 'ApprovalCreate:|ApprovalResponse:|ApprovalDecision|timeout_seconds:|status:|decision:|wait_for|idempot|serializ|timeout|rejected|expired' src/generated/api.d.ts src/generated/index.ts README.md
Exit: 0

README.md-44-
README.md-45-// When the agent calls this:
README.md-46-await wireTransfer(50_000_00, 'acct_acme_corp');
README.md-47-// 1. Sentinel pauses execution.
README.md-48-// 2. alice@acme.com gets an email with Approve / Reject.
README.md-49-// 3. On Approve → stripe.transfers.create runs, return value flows back.
README.md-50-// 4. On Reject  → ApprovalRejected thrown.
README.md:51:// 5. On timeout → ApprovalTimeout thrown.
README.md-52-```
README.md-53-
README.md-54-## What you get
README.md-55-
README.md-56-- **One wrapper** — `oversight({...}, fn)` returns a new fn with the same signature
README.md-57-- **Magic-link approval** — signed HMAC tokens on Approve / Reject buttons
README.md-58-- **Postgres LISTEN/NOTIFY** — sub-100 ms decision propagation; the wait is real-time
--
README.md-99-    console.log(`API ${e.statusCode}:`, e.message);
README.md-100-  }
README.md-101-}
README.md-102-```
README.md-103-
README.md-104-## Idempotency
README.md-105-
README.md:106:Pass `idempotencyKey` to make approval creation safe to retry — the same
README.md-107-(tenant, key) replays the original response without creating duplicate
README.md-108-approvals or firing duplicate notifications. Same key with a different body
README.md-109-returns a 409. A string is used as-is; a function is called once per
README.md-110-invocation.
README.md-111-
README.md-112-```typescript
README.md-113-const wireTransfer = oversight(
README.md:114:  { riskLevel: 'high', idempotencyKey: () => crypto.randomUUID() },
README.md-115-  async (amountCents: number, recipient: string) => { /* ... */ }
README.md-116-);
README.md-117-
README.md-118-// or directly:
README.md-119-await client.createApproval({
README.md-120-  functionName: 'wireTransfer',
README.md-121-  arguments: { amountCents: 50_000_00 },
README.md:122:  idempotencyKey: '[REDACTED: synthetic idempotency example]',
README.md-123-});
README.md-124-```
README.md-125-
README.md-126-## Listing & pagination
README.md-127-
README.md-128-`listApprovals` returns one page (`{ data, hasMore, nextCursor }`);
README.md-129-`iterApprovals` walks every page for you. Audit events:
README.md-130-`listAuditEventsPage` with the same shape.
README.md-131-
README.md-132-```typescript
README.md:133:const page = await client.listApprovals({ status: 'pending', limit: 20 });
README.md-134-// page.data, page.hasMore, page.nextCursor
README.md-135-
README.md:136:for await (const approval of client.iterApprovals({ status: 'pending' })) {
README.md-137-  console.log(approval.action_id, approval.status);
README.md-138-}
README.md-139-```
README.md-140-
README.md-141-## Tenant settings
README.md-142-
README.md-143-```typescript
--
README.md-151-
README.md-152-## Configuration
README.md-153-
README.md-154-| Option | Default | Description |
README.md-155-|---|---|---|
README.md-156-| `apiKey` | _required_ | Your tenant API key (sk_live_…) |
README.md-157-| `apiUrl` | `https://api.pauseapi.app` | Backend URL |
README.md:158:| `timeoutSeconds` | `300` | Default approval timeout |
README.md-159-
README.md-160-## Audit log
README.md-161-
README.md-162-```typescript
README.md-163-const events = await client.listAuditEvents('act_abc123');
README.md-164-// each event has prev_hash + event_hash (SHA-256), verifiable chain
README.md-165-```
--
src/generated/api.d.ts-144-            cookie?: never;
src/generated/api.d.ts-145-        };
src/generated/api.d.ts-146-        /**
src/generated/api.d.ts-147-         * Wait For Decision
src/generated/api.d.ts-148-         * @description Long-poll for a decision. Uses Postgres LISTEN/NOTIFY for sub-100ms
src/generated/api.d.ts-149-         *     detection, with a 100ms DB fallback poll to handle missed notifications.
src/generated/api.d.ts-150-         */
src/generated/api.d.ts:151:        get: operations["wait_for_decision_v1_approvals__action_id__wait_get"];
src/generated/api.d.ts-152-        put?: never;
src/generated/api.d.ts-153-        post?: never;
src/generated/api.d.ts-154-        delete?: never;
src/generated/api.d.ts-155-        options?: never;
src/generated/api.d.ts-156-        head?: never;
src/generated/api.d.ts-157-        patch?: never;
src/generated/api.d.ts-158-        trace?: never;
--
src/generated/api.d.ts-497-        trace?: never;
src/generated/api.d.ts-498-    };
src/generated/api.d.ts-499-}
src/generated/api.d.ts-500-export type webhooks = Record<string, never>;
src/generated/api.d.ts-501-export interface components {
src/generated/api.d.ts-502-    schemas: {
src/generated/api.d.ts-503-        /** ApprovalCreate */
src/generated/api.d.ts:504:        ApprovalCreate: {
src/generated/api.d.ts-505-            /** Function Name */
src/generated/api.d.ts-506-            function_name: string;
src/generated/api.d.ts-507-            /**
src/generated/api.d.ts-508-             * Arguments
src/generated/api.d.ts-509-             * @default {}
src/generated/api.d.ts-510-             */
src/generated/api.d.ts-511-            arguments: {
--
src/generated/api.d.ts-521-             * @default []
src/generated/api.d.ts-522-             */
src/generated/api.d.ts-523-            approvers: string[];
src/generated/api.d.ts-524-            /**
src/generated/api.d.ts-525-             * Timeout Seconds
src/generated/api.d.ts-526-             * @default 300
src/generated/api.d.ts-527-             */
src/generated/api.d.ts:528:            timeout_seconds: number;
src/generated/api.d.ts-529-        };
src/generated/api.d.ts-530-        /** ApproverContactCreate */
src/generated/api.d.ts-531-        ApproverContactCreate: {
src/generated/api.d.ts-532-            /**
src/generated/api.d.ts-533-             * Channel
src/generated/api.d.ts-534-             * @default sms
src/generated/api.d.ts-535-             */
--
src/generated/api.d.ts-576-            description?: string | null;
src/generated/api.d.ts-577-            /** Event Filter */
src/generated/api.d.ts-578-            event_filter?: string[] | null;
src/generated/api.d.ts-579-        };
src/generated/api.d.ts-580-        /** DecisionRequest */
src/generated/api.d.ts-581-        DecisionRequest: {
src/generated/api.d.ts-582-            /** Decision */
src/generated/api.d.ts:583:            decision: string;
src/generated/api.d.ts-584-            /** Decided By */
src/generated/api.d.ts-585-            decided_by: string;
src/generated/api.d.ts-586-            /** Reason */
src/generated/api.d.ts-587-            reason?: string | null;
src/generated/api.d.ts-588-        };
src/generated/api.d.ts-589-        /** HTTPValidationError */
src/generated/api.d.ts-590-        HTTPValidationError: {
--
src/generated/api.d.ts-918-                };
src/generated/api.d.ts-919-                content: {
src/generated/api.d.ts-920-                    "application/json": components["schemas"]["HTTPValidationError"];
src/generated/api.d.ts-921-                };
src/generated/api.d.ts-922-            };
src/generated/api.d.ts-923-        };
src/generated/api.d.ts-924-    };
src/generated/api.d.ts:925:    wait_for_decision_v1_approvals__action_id__wait_get: {
src/generated/api.d.ts-926-        parameters: {
src/generated/api.d.ts-927-            query?: {
src/generated/api.d.ts-928-                /** @description Seconds to wait for a decision */
src/generated/api.d.ts:929:                timeout?: number;
src/generated/api.d.ts-930-            };
src/generated/api.d.ts-931-            header: {
src/generated/api.d.ts-932-                authorization: string;
src/generated/api.d.ts-933-            };
src/generated/api.d.ts-934-            path: {
src/generated/api.d.ts-935-                action_id: string;
src/generated/api.d.ts-936-            };
