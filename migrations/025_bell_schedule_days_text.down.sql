-- 025_bell_schedule_days_text.down.sql
-- Rollback of 025: narrow bell_schedules.days back to VARCHAR(255).
-- Only safe to run when every stored days value fits in 255 characters;
-- the down chain (latest → 001) is a development/DR tool, never run
-- blindly against production schedules (a real school week stringifies
-- to ~1.3KB). PostgreSQL raises string_data_right_truncation for any
-- over-long value, which is the intended fail-closed behaviour.

BEGIN;

ALTER TABLE bell_schedules ALTER COLUMN days TYPE VARCHAR(255) USING days::text;

COMMIT;
