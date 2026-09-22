#!/usr/bin/env node
'use strict';

const assert = require('assert');
const fs = require('fs');
const cp = require('child_process');

const p = 'tools/production-verifier.sh';
const s = fs.readFileSync(p, 'utf8');

function pass(name, fn) {
  fn();
  console.log('PASS ' + name);
}

// 1 Functional contract: script is valid bash and remains executable in CI.
pass('functional-shell-syntax', () => {
  cp.execFileSync('bash', ['-n', p], { stdio: 'pipe' });
});

// 2 Boundary: T5 must build the intentionally pre-authority database through 018,
// and must never attempt 019/020 against that database.
pass('boundary-t5-excludes-authority-migrations', () => {
  const excludes019 = s.includes('grep -v \'019_\'') ||
    s.includes('*"/019_"*|*"/020_"*) continue ;;');
  assert.ok(excludes019, 'T5 must explicitly exclude migration 019/020 from the pre-authority DB');
});

// 3 Negative/failure: T2/T6 must not depend on a pre-seeded PG identity DB.
// The verifier must create its exact auth fixture in PostgreSQL.
pass('negative-empty-pg-auth-fixture', () => {
  assert.ok(s.includes('P7V_AUTH_FIXTURE_MISSING_USERS'));
  assert.ok(s.includes('INSERT INTO users'));
  assert.ok(s.includes('INSERT INTO schools'));
  assert.ok(s.includes('psql "$URL" -v ON_ERROR_STOP=1 -q'));
});

// 4 Resilience/replay: T6 must retain kill/restart and replay assertions.
pass('concurrency-replay-resilience', () => {
  assert.ok(s.includes('kill -9 "$PIDA"'));
  assert.ok(s.includes('replay same nonce'));
  assert.ok(s.includes('phase6_replay_ledger'));
});

// 5 Production-fixture boundary: OTP echo is test-only and the verifier must
// not accidentally force NODE_ENV=production while it needs the test fixture.
pass('otp-fixture-boundary', () => {
  assert.ok(s.includes('PAYESH_DEMO_CODE=1'));
  assert.ok(s.includes('NODE_ENV=development'));
  assert.ok(!s.includes('NODE_ENV=production'));
});

// 6 Independent regression: the verifier still has all T1..T7 anchors and
// fail-closed verdict semantics.
pass('independent-regression-verifier-contract', () => {
  for (const t of ['T1','T2','T3','T4','T5','T6','T7']) {
    assert.ok(s.includes('════ ' + t + ' '), 'missing ' + t);
    assert.strictEqual((s.match(new RegExp('════ ' + t + ' ', 'g')) || []).length, 1, 'duplicate ' + t);
  }
  assert.ok(s.includes('VERDICT: VERIFIED'));
  assert.ok(s.includes('VERDICT: NOT VERIFIED'));
});

console.log('Phase 7 verifier contract: 6/6 PASS');
