// Sentinel JS SDK demo — equivalent to ../sentinel-examples/demo.py
//
// Run:  SENTINEL_API_KEY=sk_live_... node examples/demo.mjs
//
// (Assumes you ran `npm run build` first, OR `node --experimental-strip-types`)

import { configure, oversight } from '../dist/index.js';

configure({ apiKey: process.env.SENTINEL_API_KEY });

const wireTransfer = oversight(
  { riskLevel: 'high', timeoutSeconds: 300 },
  async (amountCents, recipient, memo) => {
    console.log(`  → executing wire: $${(amountCents / 100).toLocaleString()} → ${recipient}`);
    return {
      id: `tr_${Math.floor(Date.now() / 1000)}`,
      amount: amountCents,
      destination: recipient,
      memo,
      status: 'succeeded',
    };
  }
);

console.log('\n🤖 Agent: I need to send a payment to a vendor.');
console.log("   Calling wireTransfer($50,000, 'acct_acme_corp', 'Q2 invoice')…\n");
console.log('⏸  Sentinel paused execution. Email sent to approver.');
console.log('   Open your inbox → click Approve.\n');

const started = Date.now();
const receipt = await wireTransfer(50_000_00, 'acct_acme_corp', 'Q2 invoice');
const elapsed = ((Date.now() - started) / 1000).toFixed(1);

console.log(`\n✅ Human approved in ${elapsed}s.`);
console.log(`   Receipt:`, receipt);
console.log();
