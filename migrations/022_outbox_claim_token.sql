-- Migration 022: Outbox claim token (RR-03, Arena-2 runtime reliability audit)
-- Every atomic claim mints a claim_token; stale reclaims mint a NEW token so a
-- late/slow previous owner's mark() no-ops on the token predicate instead of
-- overwriting the new owner's state. extendLease() refreshes processing_at
-- while the token owns the row (worker heartbeat). Idempotent forward migration.
BEGIN;
ALTER TABLE server_outbox ADD COLUMN IF NOT EXISTS claim_token VARCHAR(64);
CREATE INDEX IF NOT EXISTS idx_server_outbox_claim_token
  ON server_outbox (id, claim_token);
COMMIT;
