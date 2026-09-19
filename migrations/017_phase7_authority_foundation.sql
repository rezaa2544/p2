BEGIN;

-- ═══════════════════════════════════════════════════════════════════
-- migrations/017_phase7_authority_foundation.sql
-- Phase 7: Single Source of Truth (SSoT) Authority Engine Foundation
-- ═══════════════════════════════════════════════════════════════════

-- 1. Canary Routing & Cluster State SSoT
CREATE TABLE IF NOT EXISTS canary_state (
    id VARCHAR(64) PRIMARY KEY,
    cluster VARCHAR(64) NOT NULL,
    weight INTEGER NOT NULL CHECK (weight >= 0 AND weight <= 100),
    version INTEGER NOT NULL DEFAULT 1,
    updated_by VARCHAR(64) NOT NULL DEFAULT 'system',
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Seed baseline canary cluster state
INSERT INTO canary_state (id, cluster, weight, version, updated_by)
VALUES 
    ('tehran-central-01', 'کلاستر مرکزی تهران', 100, 1, 'bootstrap'),
    ('ir-border-west-1', 'کلاستر مرزی غرب', 100, 1, 'bootstrap')
ON CONFLICT (id) DO NOTHING;

-- 2. Governance Ledger (Replay & Operation Signature SSoT)
CREATE TABLE IF NOT EXISTS governance_ledger (
    id BIGSERIAL PRIMARY KEY,
    operator VARCHAR(64) NOT NULL,
    action VARCHAR(128) NOT NULL,
    nonce VARCHAR(128) NOT NULL UNIQUE,
    signature TEXT NOT NULL,
    payload JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_governance_ledger_operator_action ON governance_ledger (operator, action);

-- 3. Tenant Isolation Policy SSoT
CREATE TABLE IF NOT EXISTS tenant_policy (
    id BIGSERIAL PRIMARY KEY,
    province VARCHAR(64) NOT NULL,
    school_id BIGINT,
    scope JSONB NOT NULL DEFAULT '["*"]'::jsonb,
    version INTEGER NOT NULL DEFAULT 1,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT uq_tenant_policy_province_school UNIQUE (province, school_id)
);

CREATE INDEX IF NOT EXISTS idx_tenant_policy_province_school ON tenant_policy (province, school_id);

-- Seed default national tenant policy
INSERT INTO tenant_policy (province, school_id, scope, version)
VALUES ('ALL', NULL, '["*"]'::jsonb, 1)
ON CONFLICT (province, school_id) DO NOTHING;

-- 4. System Governance Audit Ledger
CREATE TABLE IF NOT EXISTS system_audit (
    id BIGSERIAL PRIMARY KEY,
    actor VARCHAR(64) NOT NULL,
    action VARCHAR(128) NOT NULL,
    before_state JSONB,
    after_state JSONB,
    reason TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_system_audit_actor_action ON system_audit (actor, action, created_at);

COMMIT;
