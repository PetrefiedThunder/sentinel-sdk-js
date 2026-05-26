// End-to-end smoke test: hits the live API at api.pauseapi.app, fires an
// approval, auto-approves via REST, asserts the wrapped fn ran with the
// right args and returned the right value.
//
// Run:  SENTINEL_API_KEY=sk_live_... node tests/smoke.mjs

import assert from 'node:assert/strict';
import {
  configure,
  oversight,
  SentinelClient,
  ApprovalRejected,
  ApprovalTimeout,
  VERSION,
} from '../dist/index.js';

const KEY = process.env.SENTINEL_API_KEY;
if (!KEY) {
  console.error('SENTINEL_API_KEY required');
  process.exit(1);
}
const API = 'https://api.pauseapi.app';

console.log(`sentinel-oversight (js) v${VERSION} smoke test`);
console.log('═'.repeat(60));

configure({ apiKey: KEY, apiUrl: API });
const client = new SentinelClient({ apiKey: KEY, apiUrl: API });

// auto-decide helper
async function decide(actionId, decision, delayMs = 500) {
  await new Promise((r) => setTimeout(r, delayMs));
  const r = await fetch(
    `${API}/v1/approvals/${actionId}/decision`,
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${KEY}`,
      },
      body: JSON.stringify({ decision, decided_by: 'smoke-test-js' }),
    }
  );
  if (!r.ok) throw new Error(`decide failed: ${r.status} ${await r.text()}`);
}

// shared auto-decider: keep approving/rejecting whatever's pending until told to stop
function makeAutoDecider(decision) {
  let stop = false;
  const loop = (async () => {
    while (!stop) {
      try {
        const list = await fetch(`${API}/v1/approvals?limit=5`, {
          headers: { Authorization: `Bearer ${KEY}` },
        }).then((r) => r.json());
        for (const a of list) {
          if (a.decision === 'pending') await decide(a.action_id, decision, 0);
        }
      } catch {}
      await new Promise((r) => setTimeout(r, 250));
    }
  })();
  return async () => {
    stop = true;
    await loop;
  };
}

// 1. Happy path
console.log('\n1. Happy path — approval → fn runs → return value');
{
  let captured = null;
  const transfer = oversight(
    { riskLevel: 'medium', timeoutSeconds: 30 },
    async ({ amount, recipient }) => {
      captured = { amount, recipient };
      return { ok: true, amount };
    }
  );
  const cancel = makeAutoDecider('approved');
  const t0 = Date.now();
  const result = await transfer({ amount: 100, recipient: 'alice' });
  await cancel();
  const elapsed = ((Date.now() - t0) / 1000).toFixed(2);
  assert.deepEqual(result, { ok: true, amount: 100 });
  assert.deepEqual(captured, { amount: 100, recipient: 'alice' });
  console.log(`   ✅ ${elapsed}s, args+return propagated correctly`);
}

// 2. Rejection → ApprovalRejected
console.log('\n2. Rejection — must throw ApprovalRejected');
{
  const risky = oversight(
    { riskLevel: 'high', timeoutSeconds: 30 },
    async () => 'should-not-run'
  );
  const cancel = makeAutoDecider('rejected');
  try {
    await risky();
    await cancel();
    assert.fail('should have thrown ApprovalRejected');
  } catch (e) {
    await cancel();
    assert.ok(e instanceof ApprovalRejected, `wrong error: ${e?.constructor?.name}: ${e.message}`);
    console.log(`   ✅ ApprovalRejected thrown: ${e.message}`);
  }
}

// 3. JSON-serializability fail-fast
console.log('\n3. BigInt arg — must throw TypeError immediately');
{
  const fn = oversight({ riskLevel: 'low', timeoutSeconds: 5 }, async () => 'x');
  try {
    await fn(123n);
    assert.fail('should have thrown TypeError');
  } catch (e) {
    assert.ok(e instanceof TypeError, `wrong error: ${e?.constructor?.name}`);
    console.log(`   ✅ TypeError raised before any network call`);
  }
}

// 4. Tenant helpers
console.log('\n4. Tenant helpers — getTenant returns email_verified_at');
{
  const tenant = await client.getTenant();
  assert.ok(tenant.id);
  assert.ok(tenant.email);
  assert.ok('email_verified_at' in tenant, 'missing email_verified_at field');
  console.log(`   ✅ tenant.id=${tenant.id}  email_verified_at=${tenant.email_verified_at}`);
}

// 5. Timeout path
console.log('\n5. Timeout — 4s wait with no decision must throw ApprovalTimeout');
{
  const fn = oversight({ riskLevel: 'low', timeoutSeconds: 4 }, async () => 'x');
  const t0 = Date.now();
  try {
    await fn({ note: 'no approver will click' });
    assert.fail('should have thrown ApprovalTimeout');
  } catch (e) {
    const elapsed = ((Date.now() - t0) / 1000).toFixed(1);
    assert.ok(e instanceof ApprovalTimeout, `wrong error: ${e?.constructor?.name}`);
    console.log(`   ✅ ApprovalTimeout after ${elapsed}s`);
  }
}

console.log('\n' + '═'.repeat(60));
console.log('✅ all smoke tests passed');
