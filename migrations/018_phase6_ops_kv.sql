BEGIN;

-- Phase 6.6: durable operational SoT for Phase-5 control-plane maps
-- (national traffic weights, capacity reservations, change registry, NOC).
-- RAM remains a cache; this table is the cross-instance authority.

CREATE TABLE IF NOT EXISTS phase6_ops_kv (
  key TEXT PRIMARY KEY,
  value JSONB NOT NULL,
  version INTEGER NOT NULL DEFAULT 1,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_phase6_ops_kv_updated ON phase6_ops_kv (updated_at DESC);

COMMIT;
