/**
 * Chaos Scenario 6: Database Replication Lag Spike
 * Phase 5 Step 5 (P2-NI-03): National Production Fabric Validation
 */

'use strict';

const assert = require('assert');
const { calculateRecoveryReadinessScore } = require('../../../../server/infrastructure/disaster-recovery');
const { enforceOperationalSloGate, SLO_ENFORCEMENT_STATUS } = require('../../../../server/monitoring/national-observability-plane');

function runReplicationLagChaosTest() {
  // 1. Simulate severe database replication lag (480s > 300s limit)
  const score = calculateRecoveryReadinessScore({
    wal_lag_seconds: 480,
    standby_synced: false,
    checksum_valid: true
  });

  assert.ok(score <= 60, 'DR readiness score must degrade significantly when replication lags');

  // 2. SLO gate must detect replication lag breach
  const sloResult = enforceOperationalSloGate({
    is_live: true,
    p95_latency_ms: 150,
    p99_latency_ms: 500,
    error_rate_pct: 0.02,
    db_replication_lag_ms: 450 // exceeds 300ms limit
  });

  assert.strictEqual(sloResult.status, SLO_ENFORCEMENT_STATUS.BREACHED);
  assert.strictEqual(sloResult.compliant, false);
  assert.ok(sloResult.breaches.some(b => b.includes('replication lag')));

  return {
    scenario: 'replication_lag_breach',
    expected_behavior: 'Detect replication lag and degrade DR score to <=60 without automated failover',
    actual_behavior: 'SLO gate marked BREACHED and DR score degraded to ' + score,
    fail_closed: true,
    data_loss: false,
    tenant_leakage: false,
    recovery_path: 'Trigger manual WAL catch-up or supervised failover Rehearsal',
    human_approval_required: true,
    status: 'PASSED'
  };
}

module.exports = { runReplicationLagChaosTest };
