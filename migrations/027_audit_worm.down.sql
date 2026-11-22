-- 027_audit_worm.down.sql — بازگردانیِ migrationِ 027
BEGIN;
DROP TRIGGER IF EXISTS audit_events_worm_no_update ON audit_events_worm;
DROP TRIGGER IF EXISTS audit_events_worm_no_delete ON audit_events_worm;
DROP TABLE IF EXISTS audit_events_worm;
COMMIT;
