BEGIN;

-- ═══════════════════════════════════════════════════════════════════
-- migrations/017_phase7_authority_foundation.down.sql
-- Rollback for Phase 7 Authority Engine Foundation
-- ═══════════════════════════════════════════════════════════════════

DROP TABLE IF EXISTS system_audit CASCADE;
DROP TABLE IF EXISTS tenant_policy CASCADE;
DROP TABLE IF EXISTS governance_ledger CASCADE;
DROP TABLE IF EXISTS canary_state CASCADE;

COMMIT;
