-- Rollback for 009_report_logs_constraints.sql
-- Dropping CHECK constraints loses nothing but the enforcement; rows stay.
BEGIN;
DROP INDEX IF EXISTS idx_grades_school_updated_id;
DROP INDEX IF EXISTS idx_attendance_school_updated_id;
DROP INDEX IF EXISTS idx_report_logs_school_updated_id;
ALTER TABLE report_logs DROP CONSTRAINT IF EXISTS chk_report_logs_generated_by;
ALTER TABLE report_logs DROP CONSTRAINT IF EXISTS chk_report_logs_status;
ALTER TABLE report_logs DROP CONSTRAINT IF EXISTS chk_report_logs_format;
ALTER TABLE report_logs DROP CONSTRAINT IF EXISTS chk_report_logs_kind;
COMMIT;
