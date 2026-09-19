BEGIN;

-- Phase 7: authority foundation.
-- canary_state / governance_ledger are VIEWS over existing Phase-6 SoT
-- (phase6_canary_configs, phase6_replay_ledger) — NOT parallel tables.
-- New physical SoT: tenant_policy, system_audit, authority_state.

CREATE TABLE IF NOT EXISTS tenant_policy (
  province TEXT NOT NULL,
  school TEXT NOT NULL DEFAULT '*',
  allowed_scope JSONB NOT NULL DEFAULT '{"match":"actor_province"}'::jsonb,
  version INTEGER NOT NULL DEFAULT 1,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (province, school)
);

CREATE TABLE IF NOT EXISTS system_audit (
  id BIGSERIAL PRIMARY KEY,
  actor TEXT NOT NULL,
  reason TEXT,
  action TEXT NOT NULL,
  before JSONB,
  after JSONB,
  timestamp TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_system_audit_ts ON system_audit (timestamp DESC);

-- HTTP-mutable Phase-5 control-plane (provincial, region, capacity, noc, change).
CREATE TABLE IF NOT EXISTS authority_state (
  kind TEXT NOT NULL,
  id TEXT NOT NULL,
  payload JSONB NOT NULL,
  version INTEGER NOT NULL DEFAULT 1,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_by TEXT,
  PRIMARY KEY (kind, id)
);
CREATE INDEX IF NOT EXISTS idx_authority_state_kind ON authority_state (kind);

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

-- Seed isolation policies for canonical province codes used by routing/tenant tests.
INSERT INTO tenant_policy (province, school, allowed_scope, version) VALUES
  ('00','*','{"match":"actor_province"}',1),
  ('01','*','{"match":"actor_province"}',1),
  ('02','*','{"match":"actor_province"}',1),
  ('03','*','{"match":"actor_province"}',1),
  ('04','*','{"match":"actor_province"}',1),
  ('05','*','{"match":"actor_province"}',1),
  ('06','*','{"match":"actor_province"}',1),
  ('07','*','{"match":"actor_province"}',1),
  ('09','*','{"match":"actor_province"}',1),
  ('10','*','{"match":"actor_province"}',1),
  ('11','*','{"match":"actor_province"}',1),
  ('12','*','{"match":"actor_province"}',1),
  ('13','*','{"match":"actor_province"}',1),
  ('14','*','{"match":"actor_province"}',1),
  ('15','*','{"match":"actor_province"}',1),
  ('16','*','{"match":"actor_province"}',1),
  ('17','*','{"match":"actor_province"}',1),
  ('18','*','{"match":"actor_province"}',1),
  ('19','*','{"match":"actor_province"}',1),
  ('20','*','{"match":"actor_province"}',1),
  ('21','*','{"match":"actor_province"}',1),
  ('22','*','{"match":"actor_province"}',1),
  ('23','*','{"match":"actor_province"}',1),
  ('25','*','{"match":"actor_province"}',1)
ON CONFLICT (province, school) DO NOTHING;

COMMIT;
