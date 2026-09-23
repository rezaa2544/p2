'use strict';
// UNIT/MOCK fixture only. Not a backup, not measured operational evidence.
const ref = { run_id: 'unit-fixture-not-runtime', timestamp: '2026-09-23T00:00:00Z' };
module.exports = {
  ref,
  backup: { ...ref, postgres_verified: true, redis_verified: true, config_verified: true,
    postgres_checksum: 'a'.repeat(64), redis_checksum: 'b'.repeat(64), manifest_checksum: 'c'.repeat(64),
    wal_archiving: true, rdb_snapshot: true, aof_persistence: true, retention_days: 30 },
  recovery: { ...ref, achieved_rpo_seconds: 120, measured_rto_seconds: 240 },
  rehearsal: { ...ref, target_identity: 'unit-target', isolated_target: true, checksum_verified: true,
    duration_seconds: 150, tables_restored: 38, records_restored: 125000 },
  highAvailability: { database_replication_lag_ms: 10, redis_replication_lag_ms: 5,
    standby_nodes_healthy: true, standby_nodes_count: 2, queue_healthy: true }
};
