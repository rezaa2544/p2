BEGIN;

-- ═══════════════════════════════════════════════════════════════════
-- migrations/015_phase6_canary_configs.sql
-- Phase 6: Production Canary Configurations & Audit Trail SSoT
-- ═══════════════════════════════════════════════════════════════════

-- 1. Table for persistent Phase 6 Canary Cluster configurations
CREATE TABLE IF NOT EXISTS phase6_canary_configs (
  id VARCHAR(64) PRIMARY KEY,
  name VARCHAR(255) NOT NULL,
  provinces JSONB NOT NULL DEFAULT '[]'::jsonb,
  primary_dc VARCHAR(64) NOT NULL,
  secondary_dc VARCHAR(64) NOT NULL,
  capacity_tps INTEGER NOT NULL DEFAULT 2000,
  traffic_weight INTEGER NOT NULL DEFAULT 100,
  status VARCHAR(32) NOT NULL DEFAULT 'HEALTHY',
  circuit_breaker_open BOOLEAN NOT NULL DEFAULT false,
  stage VARCHAR(64) NOT NULL DEFAULT 'STAGE_4_FULL_NATIONAL',
  version INTEGER NOT NULL DEFAULT 1,
  updated_by INTEGER,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_phase6_canary_status ON phase6_canary_configs (status, circuit_breaker_open);

-- 2. Table for Phase 6 Operator Governance & Audit Events
CREATE TABLE IF NOT EXISTS phase6_audit_events (
  id BIGSERIAL PRIMARY KEY,
  action VARCHAR(64) NOT NULL,
  cluster_id VARCHAR(64),
  operator_id INTEGER NOT NULL,
  operator_role VARCHAR(32) NOT NULL,
  old_weight INTEGER,
  new_weight INTEGER,
  reason TEXT,
  signature VARCHAR(128),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_phase6_audit_cluster ON phase6_audit_events (cluster_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_phase6_audit_created ON phase6_audit_events (created_at DESC);

-- 3. Seed default national clusters if not already present
INSERT INTO phase6_canary_configs (id, name, provinces, primary_dc, secondary_dc, capacity_tps, traffic_weight, status, stage, version)
VALUES
  ('ir-tehran-1', 'کلاستر پایتخت و حوزه مرکزی', '["07", "00"]'::jsonb, 'tehran-dc-01', 'tehran-dc-02', 5000, 100, 'HEALTHY', 'STAGE_4_FULL_NATIONAL', 1),
  ('ir-isfahan-1', 'کلاستر فلات مرکزی ایران', '["04", "25", "03", "20"]'::jsonb, 'isfahan-dc-01', 'isfahan-dc-02', 3000, 100, 'HEALTHY', 'STAGE_4_FULL_NATIONAL', 1),
  ('ir-khorasan-1', 'کلاستر شمال شرق و شرق', '["09", "10", "11", "12"]'::jsonb, 'mashhad-dc-01', 'mashhad-dc-02', 3000, 100, 'HEALTHY', 'STAGE_4_FULL_NATIONAL', 1),
  ('ir-fars-1', 'کلاستر جنوب و حوزه خلیج فارس', '["14", "15", "16", "17"]'::jsonb, 'shiraz-dc-01', 'shiraz-dc-02', 2500, 100, 'HEALTHY', 'STAGE_4_FULL_NATIONAL', 1),
  ('ir-tabriz-1', 'کلاستر شمال غرب و حوزه خزر', '["01", "02", "05", "06", "13"]'::jsonb, 'tabriz-dc-01', 'tabriz-dc-02', 3000, 100, 'HEALTHY', 'STAGE_4_FULL_NATIONAL', 1),
  ('ir-border-west-1', 'کلاستر غرب و نوار مرزی مقاوم', '["18", "19", "21", "22", "23"]'::jsonb, 'ahvaz-dc-01', 'kermanshah-dc-01', 2500, 100, 'HEALTHY', 'STAGE_4_FULL_NATIONAL', 1),
  ('ir-rural-central-1', 'کلاستر مدارس روستایی و عشایری سراسر کشور', '["RURAL_ALL"]'::jsonb, 'tehran-dc-03', 'isfahan-dc-03', 2000, 100, 'HEALTHY', 'STAGE_4_FULL_NATIONAL', 1)
ON CONFLICT (id) DO NOTHING;

COMMIT;
