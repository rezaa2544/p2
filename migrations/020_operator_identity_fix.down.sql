BEGIN;

-- ═══════════════════════════════════════════════════════════════════
-- migrations/020_operator_identity_fix.down.sql
-- Rollback for Phase 7.5 Canary Operator Identity Model Expansion
-- ═══════════════════════════════════════════════════════════════════

ALTER TABLE system_audit 
    ALTER COLUMN actor TYPE VARCHAR(64) USING actor::VARCHAR(64);

ALTER TABLE governance_ledger 
    ALTER COLUMN operator TYPE VARCHAR(64) USING operator::VARCHAR(64);

ALTER TABLE phase6_audit_events 
    ALTER COLUMN operator_id TYPE INTEGER USING (
        CASE WHEN operator_id ~ '^[0-9]+$' THEN operator_id::INTEGER ELSE 0 END
    );

ALTER TABLE phase6_canary_configs 
    ALTER COLUMN updated_by TYPE INTEGER USING (
        CASE WHEN updated_by ~ '^[0-9]+$' THEN updated_by::INTEGER ELSE 0 END
    );

COMMIT;
