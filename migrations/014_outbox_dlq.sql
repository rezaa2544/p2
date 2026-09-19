-- ═══════════════════════════════════════════════════════════════════
-- migrations/014_outbox_dlq.sql
-- Wave 27 / Phase 5 Step 10 (P2-NI-08)
-- Dedicated Dead-Letter Queue (DLQ) & High-Performance Outbox Indexes
--
-- P0-BUG-01 fix (Chat 2 remediation, 2026-09-19): server_outbox was never
-- created by migrations 001..013 (it only existed in server/schema.sql /
-- tools/migrate-to-pg.js), so applying the chain on a clean database died here
-- with `relation "server_outbox" does not exist`. The canonical table DDL
-- (identical to server/schema.sql and to what server/outbox.js reads/writes:
-- type/collection/record_id/actor_id/version/payload/status/retry_count/
-- last_error/created_at/processed_at) is now created here first, idempotently.
-- ═══════════════════════════════════════════════════════════════════

BEGIN;

-- P0-BUG-01 fix (Chat 2 remediation, 2026-09-19): 014 previously created
-- indexes on server_outbox WITHOUT the table itself — migration 001..014 was
-- unbuildable on a clean database ("relation "server_outbox" does not
-- exist"). The table is created here, canonical shape, before any index.
CREATE TABLE IF NOT EXISTS server_outbox (
  id BIGSERIAL PRIMARY KEY,
  type VARCHAR(64) NOT NULL,
  collection VARCHAR(64) NOT NULL,
  record_id BIGINT,
  actor_id BIGINT,
  version INTEGER,
  payload JSONB,
  status VARCHAR(16) NOT NULL DEFAULT 'pending',
  retry_count INTEGER NOT NULL DEFAULT 0,
  last_error TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  processed_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_server_outbox_status ON server_outbox (status);


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

COMMIT;
