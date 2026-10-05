-- Rollback for migration 026 (N-36 durable cache invalidation scaffolding).
-- Drops the watermark table and the two partial indexes. server_outbox's
-- event columns are untouched by 026, so nothing else needs reverting.
BEGIN;
DROP INDEX IF EXISTS idx_server_outbox_processed_retention;
DROP INDEX IF EXISTS idx_server_outbox_cache_events;
DROP TABLE IF EXISTS server_outbox_watermark;
COMMIT;
