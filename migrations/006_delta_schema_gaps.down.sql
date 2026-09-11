-- Rollback for 006_delta_schema_gaps.sql
-- NOTE: dropping the updated_at column discards the resolve-stamp history
-- of sync_conflicts rows (arbitration state) — pre-production only, same
-- policy as the other .down files in this chain.
BEGIN;
DROP INDEX IF EXISTS idx_vclass_sessions_updated_at;
DROP INDEX IF EXISTS idx_hw_assignments_updated_at;
DROP INDEX IF EXISTS idx_sync_conflicts_updated_at;
ALTER TABLE sync_conflicts DROP COLUMN IF EXISTS updated_at;
COMMIT;
