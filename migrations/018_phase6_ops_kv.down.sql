BEGIN;

DROP INDEX IF EXISTS idx_phase6_ops_kv_updated;
DROP TABLE IF EXISTS phase6_ops_kv CASCADE;

COMMIT;
