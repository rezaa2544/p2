BEGIN;

-- ═══════════════════════════════════════════════════════════════════
-- migrations/015_phase6_canary_configs.down.sql
-- Rollback for Phase 6 Canary Configurations & Audit Trail
-- ═══════════════════════════════════════════════════════════════════

DROP TABLE IF EXISTS phase6_replay_ledger CASCADE;
DROP TABLE IF EXISTS phase6_audit_events CASCADE;
DROP TABLE IF EXISTS phase6_canary_configs CASCADE;

COMMIT;
