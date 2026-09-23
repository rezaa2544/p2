'use strict';
// UNIT: no default or caller estimate may masquerade as measured recovery.
const assert = require('node:assert/strict');
const dr = require('../../../server/infrastructure/disaster-recovery');
const f = require('./evidence-fixture');
for (let run = 0; run < 2; run++) {
  assert.equal(dr.verifyBackupIntegrity(f.backup).verified, true);
  assert.equal(dr.validateRestoreRehearsal(f.rehearsal).verified, true);
  assert.equal(dr.calculateRpoRtoMetrics(f.recovery).overall_compliance, true);
  assert.equal(dr.buildDisasterRecoveryHealthSnapshot({}, f).status, 'healthy');
  assert.equal(dr.verifyBackupIntegrity().verified, false);
  assert.equal(dr.verifyBackupIntegrity().last_success, null);
  assert.equal(dr.verifyBackupIntegrity().components.postgres.checksum, null);
  assert.equal(dr.validateRestoreRehearsal().drill_status, 'NOT_VERIFIED');
  assert.equal(dr.buildDisasterRecoveryHealthSnapshot().status, 'not_verified');
  assert.equal(dr.calculateRpoRtoMetrics().achieved_rpo_seconds, null);
  assert.equal(dr.calculateRpoRtoMetrics({ ...f.ref, achieved_rpo_seconds: 0, estimated_rto_seconds: 2 }).rto_compliant, null);
  const zero = dr.calculateRpoRtoMetrics({ ...f.ref, achieved_rpo_seconds: 0, measured_rto_seconds: 0 });
  assert.equal(zero.achieved_rpo_seconds, 0); assert.equal(zero.measured_rto_seconds, 0);
  assert.equal(zero.overall_compliance, true);
  for (const bad of [-1, NaN, Infinity, '0', null, undefined]) {
    assert.equal(dr.calculateRpoRtoMetrics({ ...f.ref, achieved_rpo_seconds: bad, measured_rto_seconds: bad }).overall_compliance, null);
    assert.equal(dr.validateRestoreRehearsal({ ...f.rehearsal, duration_seconds: bad }).verified, false);
  }
  assert.equal(dr.verifyBackupIntegrity({ ...f.backup, postgres_checksum: 'invalid' }).verified, false);
  assert.equal(dr.verifyBackupIntegrity({ ...f.backup, postgres_verified: 'true' }).verified, false);
  assert.equal(dr.validateRestoreRehearsal({ ...f.rehearsal, isolated_target: false }).verified, false);
  assert.equal(dr.validateRestoreRehearsal({ ...f.rehearsal, checksum_verified: false }).verified, false);
  assert.equal(dr.buildDisasterRecoveryHealthSnapshot({}, { ...f, rehearsal: { ...f.rehearsal, checksum_verified: false } }).status, 'critical');
  assert.equal(dr.calculateRecoveryReadinessScore({}), null);
  assert.equal(dr.assessCrossRegionDisasterRecovery().rpo_status.compliant, null);
  assert.equal(dr.assessCrossRegionDisasterRecovery().rto_status.compliant, null);
  const snapshots = Array.from({ length: 64 }, (_, i) => dr.buildDisasterRecoveryHealthSnapshot({ schoolId: i+1 }, f));
  snapshots.forEach((s, i) => { assert.equal(s.school_id, i+1); assert(Object.isFrozen(s)); assert(Object.isFrozen(s.backup)); });
  assert.equal(f.backup.run_id, 'unit-fixture-not-runtime');
}
console.log('DR_TRUTH_CONTRACT_PASS (UNIT, two independent input cycles; not runtime DR)');
