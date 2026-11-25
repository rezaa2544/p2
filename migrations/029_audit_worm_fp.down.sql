-- 029_audit_worm_fp.down.sql — بازگردانیِ migrationِ 029
BEGIN;
DROP INDEX IF EXISTS audit_events_worm_fp_key;
ALTER TABLE audit_events_worm DROP COLUMN IF EXISTS fp;
COMMIT;
