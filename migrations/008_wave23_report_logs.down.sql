-- Rollback for 008_wave23_report_logs.sql
-- NOTE: dropping report_logs discards the journal of generated reports
-- (audit-adjacent, not authoritative data) — pre-production only, same
-- policy as the other .down files in this chain.
BEGIN;
DROP INDEX IF EXISTS idx_report_logs_updated_at;
DROP INDEX IF EXISTS idx_report_logs_created_at;
DROP INDEX IF EXISTS idx_report_logs_school_id;
DROP TABLE IF EXISTS report_logs;
COMMIT;
