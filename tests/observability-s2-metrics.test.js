'use strict';

const assert = require('assert');
const metrics = require('../server/metrics');
const authority = require('../server/infrastructure/authority/postgres-authority');
const { audit } = require('../server/audit');

console.log('════════════════════════════════════════════════════════════');
console.log('  S2 Observability Gaps: Metrics & Failure Path Test Suite  ');
console.log('════════════════════════════════════════════════════════════\n');

let pass = 0, fail = 0;
function test(name, fn) {
  try {
    fn();
    pass++;
    console.log(`  ✅ PASS: ${name}`);
  } catch (err) {
    fail++;
    console.error(`  ❌ FAIL: ${name} — ${err.message}`);
  }
}

async function runTests() {
  test('Metric payesh_audit_write_failures_total is declared in metrics registry', () => {
    const snap = metrics.snapshot();
    assert(snap.payesh_audit_write_failures_total, 'snapshot contains payesh_audit_write_failures_total');
    assert.strictEqual(snap.payesh_audit_write_failures_total.type, 'counter');
  });

  test('Metric payesh_authority_unavailable_total is declared in metrics registry', () => {
    const snap = metrics.snapshot();
    assert(snap.payesh_authority_unavailable_total, 'snapshot contains payesh_authority_unavailable_total');
    assert.strictEqual(snap.payesh_authority_unavailable_total.type, 'counter');
  });

  test('Authority unavailable increments payesh_authority_unavailable_total in real failure path', () => {
    let threw = false;
    try {
      authority.requireDb();
    } catch (err) {
      threw = true;
      assert.strictEqual(err.code, 'AUTHORITY_UNAVAILABLE');
    }
    assert(threw, 'requireDb threw when unattached');
    const val = metrics.value('payesh_authority_unavailable_total', { subsystem: 'authority', reason: 'unattached' });
    assert(val >= 1, `expected counter >= 1, got ${val}`);
    assert(metrics.render().includes('payesh_authority_unavailable_total{subsystem="authority",reason="unattached"}'), 'rendered metric includes label values');
  });

  test('Audit write failure increments payesh_audit_write_failures_total on record error in real failure path', () => {
    const badObj = {
      get faulty() { throw new Error('forced serialization failure'); }
    };
    const res = audit.record('test_failure', badObj);
    assert.strictEqual(res, null, 'record returns null on failure');
    const val = metrics.value('payesh_audit_write_failures_total', { sink: 'record', reason: 'record_error' });
    assert(val >= 1, `expected counter >= 1, got ${val}`);
    assert(metrics.render().includes('payesh_audit_write_failures_total{sink="record",reason="record_error"}'), 'rendered metric includes label values');
  });

  console.log('\n────────────────────────────────────────────────────────────');
  console.log(`S2 Observability Gaps Suite Result: ${pass} PASS / ${fail} FAIL`);
  console.log('────────────────────────────────────────────────────────────\n');

  if (fail > 0) process.exit(1);
}

runTests();
