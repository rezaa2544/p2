-- ═══════════════════════════════════════════════════════════════════
-- migrations/014_outbox_dlq.down.sql
-- Rollback for Wave 27 Outbox DLQ & Poller Indexes
-- ═══════════════════════════════════════════════════════════════════

BEGIN;

DROP TABLE IF EXISTS server_outbox_dlq;
-- B1 (Phase-2 remediation directive): 014 owns server_outbox (it created the
-- table that 001..013 lack) — its rollback drops the table too, so DOWN ALL
-- is fully clean (indexes die with the table).
DROP TABLE IF EXISTS server_outbox CASCADE;
DROP INDEX IF EXISTS idx_server_outbox_status_id;

COMMIT;
