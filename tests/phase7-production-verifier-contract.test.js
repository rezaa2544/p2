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
  assert.ok(s.includes('case "$f" in'));
  assert.ok(s.includes('*"/019_"*|*"/020_"*) continue ;;'));
  assert.doesNotMatch(s, /grep -v '019_'/);
});

// 3 Negative/failure: T2/T6 must not depend on a pre-seeded PG identity DB.
// The verifier must create its exact auth fixture in PostgreSQL.
pass('negative-empty-pg-auth-fixture', () => {
  assert.match(s, /P7V_AUTH_FIXTURE_MISSING_USERS/);
  assert.match(s, /INSERT INTO users/);
  assert.match(s, /INSERT INTO schools/);
  assert.match(s, /psql "\$URL" -v ON_ERROR_STOP=1 -q/);
});

// 4 Resilience/replay: T6 must retain kill/restart and replay assertions.
pass('concurrency-replay-resilience', () => {
  assert.match(s, /kill -9 "\$PIDA"/);
  assert.match(s, /replay same nonce/);
  assert.match(s, /phase6_replay_ledger/);
});

// 5 Production-fixture boundary: OTP echo is test-only and the verifier must
// not accidentally force NODE_ENV=production while it needs the test fixture.
pass('otp-fixture-boundary', () => {
  assert.match(s, /PAYESH_DEMO_CODE=1/);
  assert.match(s, /NODE_ENV=development/);
  assert.doesNotMatch(s, /NODE_ENV=production.*PAYESH_DEMO_CODE=1/s);
});

// 6 Independent regression: the verifier still has all T1..T7 anchors and
// fail-closed verdict semantics.
pass('independent-regression-verifier-contract', () => {
  for (const t of ['T1','T2','T3','T4','T5','T6','T7']) {
    assert.ok(s.includes('════ ' + t + ' '), 'missing ' + t);
  }
  assert.match(s, /VERDICT: VERIFIED/);
  assert.match(s, /VERDICT: NOT VERIFIED/);
});

console.log('Phase 7 verifier contract: 6/6 PASS');
