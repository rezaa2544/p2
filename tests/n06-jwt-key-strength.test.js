#!/usr/bin/env node
/* ═════════════════════════════════════════════════════════════════
   tests/n06-jwt-key-strength.test.js — N-06 regression guard
   -------------------------------------------------------------------
   The JWT boot gate only checked byteLength >= 32, so the placeholder
   shipped in .env.example ("CHANGE_ME__generate_with_openssl_rand_hex_32",
   44 bytes) was accepted as a "strong" key — and anyone reading the repo
   could forge every session token offline.

   server/key-strength.js now also rejects placeholder markers and
   low-entropy values. These five scenarios pin the behaviour.

   N06-1  the shipped placeholders are rejected
   N06-2  short keys are still rejected (original 256-bit floor preserved)
   N06-3  a real openssl-rand-hex-32 key is accepted
   N06-4  long-but-low-entropy keys are rejected
   N06-5  the repo's existing random-ish fixture keys still pass (no
          false positives that would break the rest of the suite)
   ═════════════════════════════════════════════════════════════════ */
'use strict';

const assert = require('assert');
const crypto = require('crypto');

const { weakJwtKeyReason } = require('../server/key-strength.js');

let pass = 0, fail = 0;
function test(name, fn) {
  try { fn(); pass++; console.log('  ✅ ' + name); }
  catch (err) { fail++; console.error('  ❌ ' + name + '\n     ' + err.message); }
}

console.log('\n🔍 N-06 regression: JWT key strength');

test('N06-1: placeholders shipped in .env.example are rejected', () => {
  assert.ok(weakJwtKeyReason('CHANGE_ME__run_openssl_rand_hex_32'),
    'new .env.example placeholder accepted');
  assert.ok(weakJwtKeyReason('CHANGE_ME__generate_with_openssl_rand_hex_32'),
    'old .env.example placeholder accepted');
  assert.ok(/placeholder marker/.test(weakJwtKeyReason('CHANGE_ME__generate_with_openssl_rand_hex_32')),
    'reason should name the placeholder marker');
  const more = [
    'placeholder-value-for-jwt-signing-key-xxxx',
    'ExampleKey-please-replace-before-production',
    'YOUR_SECRET-do-not-ship-this-0123456789'
  ];
  for (const k of more) assert.ok(weakJwtKeyReason(k), 'expected rejection of ' + k);
});

test('N06-2: keys shorter than 32 bytes are still rejected', () => {
  assert.ok(weakJwtKeyReason('short'), 'short key accepted');
  assert.ok(weakJwtKeyReason('a'.repeat(31)), '31-byte key accepted');
  const r = weakJwtKeyReason('a'.repeat(31));
  assert.ok(/256 bits/.test(r), 'reason should mention the 256-bit floor, got: ' + r);
});

test('N06-3: a real openssl rand -hex 32 key is accepted', () => {
  for (let i = 0; i < 50; i++) {
    const k = crypto.randomBytes(32).toString('hex');
    assert.strictEqual(weakJwtKeyReason(k), null, 'random hex key rejected: ' + k);
  }
  /* base64 and raw-binary-derived keys of sufficient entropy too */
  assert.strictEqual(weakJwtKeyReason(crypto.randomBytes(48).toString('base64')), null);
});

test('N06-4: long-but-low-entropy keys are rejected', () => {
  assert.ok(weakJwtKeyReason('a'.repeat(64)), 'all-one-character key accepted');
  assert.ok(weakJwtKeyReason('ab'.repeat(32)), 'two-character key accepted');
  assert.ok(weakJwtKeyReason('abcabcabcabcabcabcabcabcabcabcabcabc'.slice(0, 64)), 'short repeated pattern accepted');
  const r = weakJwtKeyReason('a'.repeat(64));
  assert.ok(/distinct characters/.test(r), 'reason should mention entropy, got: ' + r);
});

test('N06-5: existing random-ish fixture keys still pass (no false positives)', () => {
  /* keys currently used by other suites in this repo — rejecting these would
     break unrelated tests, so the marker list must stay conservative. */
  const fixtures = [
    'idor-rt-test-secret-0123456789abcdef0123456789',
    'arena5-recovery-shared-jwt-secret-0123456789'
  ];
  for (const k of fixtures) {
    assert.strictEqual(weakJwtKeyReason(k), null, 'fixture key falsely rejected: ' + k);
  }
  /* the .env.example placeholder must never be mistaken for a fixture */
  assert.ok(weakJwtKeyReason('CHANGE_ME__run_openssl_rand_hex_32'));
});

console.log('\nN-06 regression tests: ' + pass + '/' + (pass + fail) + ' passed');
process.exit(fail === 0 ? 0 : 1);
