BEGIN;

DROP INDEX IF EXISTS idx_phase6_replay_expires;
DROP TABLE IF EXISTS phase6_replay_ledger CASCADE;

ALTER TABLE phase6_audit_events DROP COLUMN IF EXISTS payload;
ALTER TABLE phase6_audit_events DROP COLUMN IF EXISTS actor;
ALTER TABLE phase6_audit_events DROP COLUMN IF EXISTS event_type;

ALTER TABLE phase6_canary_configs DROP COLUMN IF EXISTS weight;
ALTER TABLE phase6_canary_configs DROP COLUMN IF EXISTS region_id;

COMMIT;
