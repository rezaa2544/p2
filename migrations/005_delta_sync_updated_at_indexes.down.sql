-- Rollback for 005_delta_sync_updated_at_indexes.sql
BEGIN;
DROP INDEX IF EXISTS idx_counselor_msgs_updated_at;
DROP INDEX IF EXISTS idx_counselor_refs_updated_at;
DROP INDEX IF EXISTS idx_bell_schedules_updated_at;
DROP INDEX IF EXISTS idx_hw_submissions_updated_at;
DROP INDEX IF EXISTS idx_announcements_updated_at;
DROP INDEX IF EXISTS idx_notifications_updated_at;
DROP INDEX IF EXISTS idx_leaves_updated_at;
DROP INDEX IF EXISTS idx_discipline_updated_at;
DROP INDEX IF EXISTS idx_grades_updated_at;
DROP INDEX IF EXISTS idx_attendance_updated_at;
DROP INDEX IF EXISTS idx_enrollments_updated_at;
DROP INDEX IF EXISTS idx_schedule_updated_at;
DROP INDEX IF EXISTS idx_subjects_updated_at;
DROP INDEX IF EXISTS idx_classes_updated_at;
DROP INDEX IF EXISTS idx_users_updated_at;
DROP INDEX IF EXISTS idx_schools_updated_at;
COMMIT;
