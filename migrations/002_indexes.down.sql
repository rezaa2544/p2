-- Payesh migration 002 rollback: drop supplemental workload indexes
BEGIN;
DROP INDEX IF EXISTS idx_schools_capabilities;
DROP INDEX IF EXISTS idx_sync_conflicts_school_status;
DROP INDEX IF EXISTS idx_notifications_user_read;
DROP INDEX IF EXISTS idx_messages_to_from;
DROP INDEX IF EXISTS idx_parent_links_parent_student;
DROP INDEX IF EXISTS idx_schedule_school_teacher_day;
DROP INDEX IF EXISTS idx_grades_school_student_subject;
DROP INDEX IF EXISTS idx_attendance_school_class_date;
DROP INDEX IF EXISTS idx_users_school_role;
COMMIT;
