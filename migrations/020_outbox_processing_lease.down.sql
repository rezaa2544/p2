BEGIN;
DROP INDEX IF EXISTS idx_server_outbox_processing_lease;
ALTER TABLE server_outbox DROP COLUMN IF EXISTS processing_at;
COMMIT;
