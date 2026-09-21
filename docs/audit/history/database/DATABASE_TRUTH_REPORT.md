# DATABASE TRUTH REPORT — Phase 7.0 Discovery

## 1. Executive Summary
This report presents the physical database schema reality of PostgreSQL 17 in `https://github.0/rezaa2544/p2` across all 16 migrations (`001_initial.sql` through `016_phase1_security_and_constraints.sql`).

---

## 2. Migration Sequence & Idempotency Audit

- **Total Forward/Down Pairs**: 16 migration pairs on disk (`migrations/001` through `migrations/016`).
- **Sequence Continuity**: Verified continuous 3-digit zero-padded numbering without gaps (`001`, `002`, `003`, ..., `016`).
- **Transactional Enclosure**: 100% of forward (`.sql`) and rollback (`.down.sql`) migration files begin with `BEGIN;` and terminate with `COMMIT;`.
- **Idempotency**: All structural DDL statements utilize defensive clauses (`CREATE TABLE IF NOT EXISTS`, `CREATE INDEX IF NOT EXISTS`, `ALTER TABLE ... ADD COLUMN IF NOT EXISTS`, `DO $$` conditional blocks).
- **Documentation Parity**: Synchronized with `docs/MIGRATION_GUIDE.md`.

---

## 3. Physical Schema Inventory (Tables, Keys & Constraints)

### Core Schema Tables (Migrations 001 – 010)
- `users`: Core identity store with `phone`, `national_id`, `role`, `school_id`, `version`, `deleted_at`.
- `schools`: Tenant organization units with `province_id`, `region_id`, `status`.
- `classes`: School class units scoped to `school_id`, with `deleted_at`.
- `enrollments`: Student class enrollments with unique active constraints `(student_id, academic_year_id) WHERE deleted_at IS NULL`.
- `grades`: Academic grades with OCC `version` column and partitioned/indexed foreign keys.
- `attendance`: Daily attendance records with `(school_id, student_id, date)` scope indexes.
- `sync_conflicts`: SSoT conflict persistence table with `(school_id, status, created_at)` indexes.
- `server_outbox`: Outbox event table for transactional event publishing.
- `server_processed_uids`: Idempotency tracking table for client operation UIDs (`uid` PK).

### Phase 6 & Security Tables (Migrations 011 – 016)
- `phase6_canary_configs`: Canary cluster configurations (`id`, `cluster_name`, `regions`, `primary_dc`, `backup_dc`, `target_capacity_rps`, `weight`, `health_status`, `rollout_stage`).
- `phase6_audit_events`: Security & operational audit trail (`event_type`, `operator_id`, `target_id`, `cluster_id`, `details`, `ip_address`).

---

## 4. Phase 7 Database Schema Extension Plan (`017_phase7_authority_foundation.sql`)

To eliminate in-memory authority state and establish complete Zero Trust persistence, the following tables must be added in migration `017`:

```sql
-- 1. Canary Routing & Cluster State SSoT
CREATE TABLE IF NOT EXISTS canary_state (
    id VARCHAR(64) PRIMARY KEY,
    cluster VARCHAR(64) NOT NULL,
    weight INTEGER NOT NULL CHECK (weight >= 0 AND weight <= 100),
    version INTEGER NOT NULL DEFAULT 1,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_by VARCHAR(64) NOT NULL
);

-- 2. Governance Ledger (Replay & Operation Signature SSoT)
CREATE TABLE IF NOT EXISTS governance_ledger (
    id BIGSERIAL PRIMARY KEY,
    operator VARCHAR(64) NOT NULL,
    action VARCHAR(128) NOT NULL,
    nonce VARCHAR(128) NOT NULL UNIQUE,
    signature TEXT NOT NULL,
    timestamp BIGINT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 3. Tenant Isolation Policy SSoT
CREATE TABLE IF NOT EXISTS tenant_policy (
    id BIGSERIAL PRIMARY KEY,
    province VARCHAR(64) NOT NULL,
    school_id BIGINT,
    allowed_scope JSONB NOT NULL DEFAULT '[]'::jsonb,
    version INTEGER NOT NULL DEFAULT 1,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT uq_tenant_policy_province_school UNIQUE (province, school_id)
);

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
```

---

## 5. Migration Execution Verification
- Migration verification runner (`node tests/migration-sequence.js`) executed: **19 / 19 checks PASS**.
- Schema constraints runner (`node tests/migrate-pg-constraints.js`) executed: **14 / 14 checks PASS**.
