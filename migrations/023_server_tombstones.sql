-- 023_server_tombstones.sql
-- N-17 (HIGH): server_tombstones existed only in server/schema.sql (a generated
-- artifact) and was created by NO migration, so a real PostgreSQL deployment
-- that followed migrations/001..022 never had it. The write side recorded
-- deletions only in the in-memory store.__deleted_records ring (capped at
-- 5000 — smaller than the 7-day delta window) and in PG mode the JSON store is
-- deliberately not persisted, so a restart — or a second instance — dropped
-- every tombstone and a hard-deleted row re-emerged as live data on the next
-- client pull (deleted users included).
--
-- This migration brings the table into the migration chain (the authoritative
-- path for schema change) and is written idempotently (IF NOT EXISTS) so a
-- database that already saw the schema.sql copy is unaffected.
-- See docs/SYNC_PROTOCOL.md (tombstone / delta) and server/db.js recordTombstone.

BEGIN;

CREATE TABLE IF NOT EXISTS server_tombstones (
  id BIGSERIAL PRIMARY KEY,
  "collection" VARCHAR(64) NOT NULL,
  record_id INTEGER NOT NULL,
  school_id INTEGER,
  deleted_by INTEGER,
  deleted_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  reason VARCHAR(255)
);

CREATE INDEX IF NOT EXISTS idx_server_tombstones_deleted_at
  ON server_tombstones (deleted_at);

CREATE INDEX IF NOT EXISTS idx_server_tombstones_school_deleted_at
  ON server_tombstones (school_id, deleted_at);

COMMIT;
