BEGIN;

-- ═══════════════════════════════════════════════════════════════════
-- migrations/020_operator_identity_fix.down.sql
-- Rollback for Phase 7.5 Canary Operator Identity Model Expansion
-- Transactional safety: Drop views, alter columns back, recreate views.
-- ═══════════════════════════════════════════════════════════════════

DROP VIEW IF EXISTS canary_state;
DROP VIEW IF EXISTS governance_ledger;

ALTER TABLE system_audit 
    ALTER COLUMN actor TYPE VARCHAR(64) USING actor::VARCHAR(64);

ALTER TABLE governance_ledger_store 
    ALTER COLUMN operator TYPE VARCHAR(64) USING operator::VARCHAR(64);

ALTER TABLE phase6_audit_events 
    ALTER COLUMN operator_id TYPE VARCHAR(128) USING operator_id::VARCHAR(128);

ALTER TABLE phase6_canary_configs 
    ALTER COLUMN updated_by TYPE VARCHAR(128) USING updated_by::VARCHAR(128);

CREATE OR REPLACE VIEW canary_state AS
  SELECT
    id,
    COALESCE(region_id, id) AS cluster,
    COALESCE(weight, traffic_weight) AS weight,
    version,
    updated_at,
    updated_by
  FROM phase6_canary_configs;

CREATE OR REPLACE VIEW governance_ledger AS
  SELECT
    nonce AS id,
    NULL::text AS operator,
    'GOVERNANCE'::text AS action,
    nonce,
    signature_hash AS signature,
    created_at AS timestamp,
    created_at
  FROM phase6_replay_ledger;

COMMIT;
