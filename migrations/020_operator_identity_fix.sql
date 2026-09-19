BEGIN;

-- ═══════════════════════════════════════════════════════════════════
-- migrations/020_operator_identity_fix.sql
-- Phase 7.6-R.3: Canary Operator Identity Model Expansion & View Safety
-- ═══════════════════════════════════════════════════════════════════

-- 1. Drop dependent views first to prevent schema dependency locks
DROP VIEW IF EXISTS canary_state CASCADE;
DROP VIEW IF EXISTS governance_ledger CASCADE;

-- 2. Alter underlying column types to support String / UUID operator identities
ALTER TABLE phase6_canary_configs 
    ALTER COLUMN updated_by TYPE VARCHAR(128) USING updated_by::VARCHAR(128);

ALTER TABLE phase6_audit_events 
    ALTER COLUMN operator_id TYPE VARCHAR(128) USING operator_id::VARCHAR(128);

ALTER TABLE system_audit 
    ALTER COLUMN actor TYPE VARCHAR(128) USING actor::VARCHAR(128);

-- 3. Recreate dependent views over phase6_canary_configs and phase6_replay_ledger
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
