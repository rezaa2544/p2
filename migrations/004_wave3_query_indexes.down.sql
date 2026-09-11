-- Rollback for 004_wave3_query_indexes.sql
-- Drops only the seven Wave 3 keyset indexes. Note that server/schema.sql
-- still declares them, so re-running schema.sql will recreate them; this
-- rollback is for the migration chain only.
BEGIN;
DROP INDEX IF EXISTS idx_classes_school_grade_id;
DROP INDEX IF EXISTS idx_grades_school_student_id;
DROP INDEX IF EXISTS idx_grades_school_id_id;
DROP INDEX IF EXISTS idx_attendance_student_date_id;
DROP INDEX IF EXISTS idx_attendance_school_date_id;
DROP INDEX IF EXISTS idx_users_role_school_id;
DROP INDEX IF EXISTS idx_users_school_role_id;
COMMIT;
