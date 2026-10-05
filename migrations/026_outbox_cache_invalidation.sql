-- ═════════════════════════════════════════════════════════════════
-- migrations/026_outbox_cache_invalidation.sql
-- N-36 / M15-05 PACMA v2 — Durable cross-instance cache invalidation
--
-- This migration adds ONLY the storage scaffolding for the durable
-- invalidation path. It does not change server_outbox's event columns:
-- the new event family (cache.user_changed / cache.school_changed /
-- cache.collection_changed) reuses type/collection/record_id/actor_id/
-- version/payload verbatim, because those columns were already designed
-- generically by migration 014.
--
-- Two new objects:
--   1. server_outbox_watermark — per-instance durable cursor. The worker
--      on each instance reads cache.* events with id > its watermark and
--      advances it after applying the (idempotent) invalidation. Storing
--      the cursor in PG (not Redis) means an instance's resume point
--      survives its own restart and a Redis outage simultaneously.
--   2. Partial indexes backing the two new query shapes: the claim-less
--      ordered cache-event scan, and the retention reaper.
-- ═════════════════════════════════════════════════════════════════

BEGIN;

-- Per-instance durable cursor for replicate-to-all (cache.*) events.
-- One row per live process; a stale row from a dead instance is inert
-- (a new process takes a new instance_id and replays from 0, which is
-- safe because the invalidation handlers are idempotent). The retention
-- reaper uses MIN(last_id) over this table as the safe-to-delete floor,
-- so a row can never be reaped before every known instance has passed it.
CREATE TABLE IF NOT EXISTS server_outbox_watermark (
  instance_id TEXT PRIMARY KEY,
  last_id     BIGINT NOT NULL DEFAULT 0,
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Phase-2 worker scan: SELECT ... WHERE type LIKE 'cache.%' AND id > $1
-- ORDER BY id ASC LIMIT $2. A partial index over only the cache events
-- keeps it small and keeps the hot path off the much larger mixed table.
CREATE INDEX IF NOT EXISTS idx_server_outbox_cache_events
  ON server_outbox (id ASC)
  WHERE type LIKE 'cache.%';

-- Retention reaper: DELETE ... WHERE status='processed' AND
-- id <= (SELECT COALESCE(MIN(last_id),0) FROM server_outbox_watermark)
-- AND processed_at < NOW() - interval. Backed by a partial index on the
-- processed rows only.
CREATE INDEX IF NOT EXISTS idx_server_outbox_processed_retention
  ON server_outbox (processed_at)
  WHERE status = 'processed';

COMMIT;
