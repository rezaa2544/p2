BEGIN;

-- ═══════════════════════════════════════════════════════════════════
-- migrations/020_operator_identity_fix.sql
-- Phase 7.5: Canary Operator Identity Model Expansion (UUID/String)
-- ═══════════════════════════════════════════════════════════════════

-- 1. Alter phase6_canary_configs updated_by to VARCHAR(128)
ALTER TABLE phase6_canary_configs 
    ALTER COLUMN updated_by TYPE VARCHAR(128) USING updated_by::VARCHAR(128);

-- 2. Alter phase6_audit_events operator_id to VARCHAR(128)
ALTER TABLE phase6_audit_events 
    ALTER COLUMN operator_id TYPE VARCHAR(128) USING operator_id::VARCHAR(128);

-- 3. Ensure governance_ledger operator and system_audit actor support String
ALTER TABLE governance_ledger 
    ALTER COLUMN operator TYPE VARCHAR(128) USING operator::VARCHAR(128);

ALTER TABLE system_audit 
    ALTER COLUMN actor TYPE VARCHAR(128) USING actor::VARCHAR(128);

COMMIT;
