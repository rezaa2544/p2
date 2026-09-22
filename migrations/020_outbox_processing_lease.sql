-- Outbox processing lease / crash recovery
BEGIN;
ALTER TABLE server_outbox ADD COLUMN IF NOT EXISTS processing_at TIMESTAMPTZ;
CREATE UNIQUE INDEX IF NOT EXISTS uq_server_outbox_dlq_outbox_id
  ON server_outbox_dlq (outbox_id);

CREATE INDEX IF NOT EXISTS idx_server_outbox_processing_lease
  ON server_outbox (status, processing_at, id)
  WHERE status = 'processing';
COMMIT;
