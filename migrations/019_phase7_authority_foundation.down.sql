BEGIN;

DROP VIEW IF EXISTS governance_ledger;
DROP VIEW IF EXISTS canary_state;
DROP INDEX IF EXISTS idx_authority_state_kind;
DROP TABLE IF EXISTS authority_state CASCADE;
DROP INDEX IF EXISTS idx_system_audit_ts;
DROP TABLE IF EXISTS system_audit CASCADE;
DROP TABLE IF EXISTS tenant_policy CASCADE;

COMMIT;
