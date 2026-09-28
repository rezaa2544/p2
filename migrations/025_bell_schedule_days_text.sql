-- 025_bell_schedule_days_text.sql
-- A-31-followup (bootstrap→PG seed + runtime mirror integrity): the client
-- stores the weekly bell schedule as an array of day objects under
-- bell_schedules.days; server/db.js valOf() persists arrays as JSON strings
-- (same convention as seedPgFromBootstrap). A real school week stringifies to
-- ~1.3KB — far beyond the VARCHAR(255) from 001 — so both the one-time
-- bootstrap seed and the live mirror write fail with
-- `value too long for type character varying(255)`. The field is free-form
-- structured content, not a bounded label: widen to TEXT.

BEGIN;

ALTER TABLE bell_schedules ALTER COLUMN days TYPE TEXT USING days::text;

COMMIT;
