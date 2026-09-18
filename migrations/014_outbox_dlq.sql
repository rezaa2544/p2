-- ═══════════════════════════════════════════════════════════════════
-- migrations/014_outbox_dlq.sql
-- Wave 27 / Phase 5 Step 10 (P2-NI-08)
-- Dedicated Dead-Letter Queue (DLQ) & High-Performance Outbox Indexes
-- ═══════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS server_outbox_dlq (
  id BIGSERIAL PRIMARY KEY,
  outbox_id BIGINT NOT NULL,
  type VARCHAR(64) NOT NULL,
  collection VARCHAR(64) NOT NULL,
  record_id BIGINT,
  actor_id BIGINT,
  version INT,
  payload JSONB,
  error_message TEXT NOT NULL,
  retry_count INT NOT NULL DEFAULT 5,
  failed_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_server_outbox_dlq_time ON server_outbox_dlq (failed_at DESC);
CREATE INDEX IF NOT EXISTS idx_server_outbox_dlq_type ON server_outbox_dlq (type, collection);

-- High-performance index for FOR UPDATE SKIP LOCKED poller
CREATE INDEX IF NOT EXISTS idx_server_outbox_status_id ON server_outbox (status, id ASC)
  WHERE status = 'pending';
