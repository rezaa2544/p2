-- 023_server_tombstones.down.sql
-- N-17: reverse of 023_server_tombstones.sql. Drops the durable tombstone
-- table and its indexes. Down is only safe inside a maintenance window where
-- no client still relies on a delta within the retention window — see
-- docs/MIGRATION_GUIDE.md (§4, per-migration rollback).

BEGIN;

DROP INDEX IF EXISTS idx_server_tombstones_school_deleted_at;
DROP INDEX IF EXISTS idx_server_tombstones_deleted_at;
DROP TABLE IF EXISTS server_tombstones;

COMMIT;
