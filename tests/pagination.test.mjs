// Unit tests for cursor pagination — stubs globalThis.fetch.
//
// Run with native node test runner:  node --test tests/pagination.test.mjs
import { test, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { SentinelClient } from '../dist/index.js';

const originalFetch = globalThis.fetch;
let recorded = [];
let responses = [];

beforeEach(() => {
  recorded = [];
  responses = [];
  globalThis.fetch = async (url, init = {}) => {
    recorded.push({ url: String(url), init });
    const body = responses.shift();
    return new Response(JSON.stringify(body), { status: 200 });
  };
});

afterEach(() => {
  globalThis.fetch = originalFetch;
});

function makeClient() {
  return new SentinelClient({ apiKey: 'sk_test', apiUrl: 'https://stub.test' });
}

test('listApprovals sends limit, status, cursor and maps envelope to PageResult', async () => {
  responses = [
    {
      data: [{ action_id: 'act_1', status: 'pending', decision: 'pending' }],
      has_more: true,
      next_cursor: 'cur_next',
    },
  ];
  const client = makeClient();
  const page = await client.listApprovals({
    status: 'pending',
    limit: 10,
    cursor: 'cur a/b',
  });
  assert.equal(recorded.length, 1);
  const url = new URL(recorded[0].url);
  assert.equal(url.pathname, '/v1/approvals');
  assert.equal(url.searchParams.get('status'), 'pending');
  assert.equal(url.searchParams.get('limit'), '10');
  assert.equal(url.searchParams.get('cursor'), 'cur a/b');
  assert.ok(recorded[0].url.includes('cursor=cur%20a%2Fb'));
  assert.deepEqual(page, {
    data: [{ action_id: 'act_1', status: 'pending', decision: 'pending' }],
    hasMore: true,
    nextCursor: 'cur_next',
  });
});

test('listApprovals defaults limit to 50 and omits absent params', async () => {
  responses = [{ data: [], has_more: false, next_cursor: null }];
  const client = makeClient();
  const page = await client.listApprovals();
  const url = new URL(recorded[0].url);
  assert.equal(url.searchParams.get('limit'), '50');
  assert.equal(url.searchParams.has('status'), false);
  assert.equal(url.searchParams.has('cursor'), false);
  assert.deepEqual(page, { data: [], hasMore: false, nextCursor: null });
});

test('iterApprovals walks pages via nextCursor and yields items in order', async () => {
  const a = { action_id: 'act_1', status: 'pending', decision: 'pending' };
  const b = { action_id: 'act_2', status: 'pending', decision: 'pending' };
  const c = { action_id: 'act_3', status: 'pending', decision: 'pending' };
  responses = [
    { data: [a, b], has_more: true, next_cursor: 'cur_2' },
    { data: [c], has_more: false, next_cursor: null },
  ];
  const client = makeClient();
  const seen = [];
  for await (const approval of client.iterApprovals({ status: 'pending', limit: 2 })) {
    seen.push(approval.action_id);
  }
  assert.deepEqual(seen, ['act_1', 'act_2', 'act_3']);
  assert.equal(recorded.length, 2);
  const url1 = new URL(recorded[0].url);
  assert.equal(url1.searchParams.has('cursor'), false);
  assert.equal(url1.searchParams.get('limit'), '2');
  const url2 = new URL(recorded[1].url);
  assert.equal(url2.searchParams.get('cursor'), 'cur_2');
  assert.equal(url2.searchParams.get('status'), 'pending');
});

test('listAuditEventsPage sends action_id/limit/cursor and maps fields', async () => {
  responses = [
    {
      data: [{ event: 'approval.created', action_id: 'act_1' }],
      has_more: false,
      next_cursor: null,
    },
  ];
  const client = makeClient();
  const page = await client.listAuditEventsPage({
    actionId: 'act_1',
    limit: 25,
    cursor: 'cur_x',
  });
  const url = new URL(recorded[0].url);
  assert.equal(url.pathname, '/v1/audit-events');
  assert.equal(url.searchParams.get('action_id'), 'act_1');
  assert.equal(url.searchParams.get('limit'), '25');
  assert.equal(url.searchParams.get('cursor'), 'cur_x');
  assert.deepEqual(page, {
    data: [{ event: 'approval.created', action_id: 'act_1' }],
    hasMore: false,
    nextCursor: null,
  });
});
