-- ═══════════════════════════════════════════════════════════════════
-- migrations/014_outbox_dlq.down.sql
-- Rollback for Wave 27 Outbox DLQ & Poller Indexes
-- ═══════════════════════════════════════════════════════════════════

DROP TABLE IF EXISTS server_outbox_dlq;
DROP INDEX IF EXISTS idx_server_outbox_status_id;
