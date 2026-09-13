-- Payesh migration 006: delta schema gaps (DELTA_HARDENING.md §6, phase 3)
-- Immutable forward migration. Rollback: 006_delta_schema_gaps.down.sql
--
-- WHY: three schema gaps on the delta path («بستن شکاف اسکیما Delta»):
--   1) sync_conflicts had created_at but NO updated_at — the delta pull
--      predicate is (created_at > $since OR updated_at > $since)
--      ORDER BY updated_at, id, so in PG-live mode every sync_conflicts
--      delta query died on the missing column and the collection could
--      never be delta-bounded. Per the brief: ADD COLUMN updated_at
--      TIMESTAMPTZ, backfill from created_at, SET NOT NULL, index it.
--   2) hw_assignments and vclass_sessions joined the pull/delta surface in
--      this phase (replacing the dead names homework / vclass_rooms, which
--      never had tables). Same policy as migration 005: single-column btree
--      on updated_at so the OR predicate gets a BitmapOr path and the
--      ORDER BY has an ordered scan source.
--
-- Writers: sync_conflicts rows are cache-side in Wave 1 (arbitration state;
-- no INSERT path mirrors them yet — see server/conflicts.js apiResolve
-- note), so SET NOT NULL breaks no existing writer. server/sync.js now
-- stamps updated_at on new conflict rows and server/conflicts.js stamps it
-- on resolve, so the future mirror path is already correct.
--
-- CONCURRENTLY is deliberately NOT used (same policy as 004/005):
-- migrations run inside a transaction and CREATE INDEX CONCURRENTLY cannot.
-- Apply by hand with CONCURRENTLY on a production database with live traffic.
BEGIN;
ALTER TABLE sync_conflicts ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ;
UPDATE sync_conflicts SET updated_at = created_at WHERE updated_at IS NULL;
ALTER TABLE sync_conflicts ALTER COLUMN updated_at SET NOT NULL;
CREATE INDEX IF NOT EXISTS idx_sync_conflicts_updated_at  ON sync_conflicts   (updated_at);
CREATE INDEX IF NOT EXISTS idx_hw_assignments_updated_at  ON hw_assignments   (updated_at);
CREATE INDEX IF NOT EXISTS idx_vclass_sessions_updated_at ON vclass_sessions  (updated_at);
COMMIT;
