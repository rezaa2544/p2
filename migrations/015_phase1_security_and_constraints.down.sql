BEGIN;

DROP INDEX IF EXISTS uq_classes_school_name_active;
DROP INDEX IF EXISTS uq_parent_links_student_parent_active;
DROP INDEX IF EXISTS uq_enrollments_student_year_active;
DROP INDEX IF EXISTS uq_users_national_id_active;
DROP INDEX IF EXISTS uq_users_phone_active;

DROP INDEX IF EXISTS idx_sync_conflicts_school_status_created;
DROP INDEX IF EXISTS idx_attendance_school_student_date;
DROP INDEX IF EXISTS idx_grades_school_subject;
DROP INDEX IF EXISTS idx_grades_school_student;
DROP INDEX IF EXISTS idx_parent_links_parent;
DROP INDEX IF EXISTS idx_parent_links_student;
DROP INDEX IF EXISTS idx_enrollments_school_year;
DROP INDEX IF EXISTS idx_enrollments_student_year;
DROP INDEX IF EXISTS idx_classes_school_deleted;
DROP INDEX IF EXISTS idx_users_deleted_at;
DROP INDEX IF EXISTS idx_users_school_role;

ALTER TABLE discipline DROP COLUMN IF EXISTS deleted_at;
ALTER TABLE attendance DROP COLUMN IF EXISTS deleted_at;
ALTER TABLE grades DROP COLUMN IF EXISTS deleted_at;
ALTER TABLE parent_links DROP COLUMN IF EXISTS deleted_at;
ALTER TABLE enrollments DROP COLUMN IF EXISTS deleted_at;
ALTER TABLE classes DROP COLUMN IF EXISTS deleted_at;
ALTER TABLE users DROP COLUMN IF EXISTS deleted_at;

COMMIT;
