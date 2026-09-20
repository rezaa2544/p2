/**
 * tests/migration-009-negative.test.js — C-7 Negative Test for Fake Green Elimination
 *
 * Verifies that tests/migration-009-live-mutations.js fails explicitly (exit 1)
 * when runtime dependencies (PG binaries / pg module) are missing, and NEVER exits 0.
 */
'use strict';

const assert = require('assert');
const cp = require('child_process');
const path = require('path');

const targetScript = path.join(__dirname, 'migration-009-live-mutations.js');

console.log('--- C-7 Negative Test: migration-009 Missing Dependency Exit Verification ---');

// Run with empty PATH and without PG_LIVE_BIN so PG binaries are missing
const env = { ...process.env, PATH: '/bin:/usr/bin', PG_LIVE_BIN: '/nonexistent/path' };
const res = cp.spawnSync(process.execPath, [targetScript], {
  env,
  encoding: 'utf8'
});

assert.strictEqual(res.status, 1, `Expected exit status 1 for missing dependency, got ${res.status}`);
assert.ok(res.stderr.includes('FAIL') || res.stdout.includes('FAIL'), 'Expected output to mention FAIL');
assert.ok(!res.stdout.includes('سبزِ نهایی'), 'Output must NEVER contain fake-green assertion "سبزِ نهایی"');

console.log('✅ PASS: migration-009-live-mutations.js fails with exit 1 when runtime dependencies are missing');
