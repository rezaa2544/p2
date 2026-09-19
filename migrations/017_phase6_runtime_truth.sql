BEGIN;

-- ═══════════════════════════════════════════════════════════════════
-- migrations/017_phase6_runtime_truth.sql
-- Phase 6.5: PostgreSQL SoT columns + durable Ed25519 replay ledger
-- Additive: safe on databases that already applied 015.
-- ═══════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS phase6_replay_ledger (
  nonce TEXT PRIMARY KEY,
  signature_hash TEXT NOT NULL UNIQUE,
  expires_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_phase6_replay_expires ON phase6_replay_ledger (expires_at);

ALTER TABLE phase6_canary_configs ADD COLUMN IF NOT EXISTS region_id VARCHAR(64);
ALTER TABLE phase6_canary_configs ADD COLUMN IF NOT EXISTS weight INTEGER;

UPDATE phase6_canary_configs
   SET region_id = id
 WHERE region_id IS NULL;

UPDATE phase6_canary_configs
   SET weight = traffic_weight
 WHERE weight IS NULL;

ALTER TABLE phase6_audit_events ADD COLUMN IF NOT EXISTS event_type VARCHAR(64);
ALTER TABLE phase6_audit_events ADD COLUMN IF NOT EXISTS actor VARCHAR(128);
ALTER TABLE phase6_audit_events ADD COLUMN IF NOT EXISTS payload JSONB;

COMMIT;
