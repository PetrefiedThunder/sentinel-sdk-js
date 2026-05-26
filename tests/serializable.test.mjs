// Unit tests for ensureJsonSerializable — mirrors Python 0.1.8 test suite.
//
// Run with native node test runner:  node --test tests/serializable.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ensureJsonSerializable } from '../dist/index.js';

test('plain dict ok', () => {
  ensureJsonSerializable({ amount: 100, recipient: 'alice' });
});

test('nested dict ok', () => {
  ensureJsonSerializable({ meta: { tags: ['a', 'b'], n: 1 } });
});

test('primitives ok', () => {
  for (const v of [null, true, 1, 1.5, 'str', [], {}, [1, 2, 3]]) {
    ensureJsonSerializable(v);
  }
});

test('BigInt raises TypeError', () => {
  assert.throws(() => ensureJsonSerializable(123n), TypeError);
});

test('circular reference raises TypeError', () => {
  const a = {};
  a.self = a;
  assert.throws(() => ensureJsonSerializable(a), TypeError);
});

test('nested unserializable raises TypeError', () => {
  assert.throws(
    () => ensureJsonSerializable({ ok: 'yes', bad: 123n }),
    TypeError
  );
});
