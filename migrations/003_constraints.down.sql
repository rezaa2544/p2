-- Payesh migration 003 rollback: remove supplemental constraints
BEGIN;
ALTER TABLE IF EXISTS grades DROP CONSTRAINT IF EXISTS fk_grades_teacher;
ALTER TABLE IF EXISTS grades DROP CONSTRAINT IF EXISTS fk_grades_subject;
ALTER TABLE IF EXISTS grades DROP CONSTRAINT IF EXISTS fk_grades_class;
ALTER TABLE IF EXISTS grades DROP CONSTRAINT IF EXISTS fk_grades_student;
ALTER TABLE IF EXISTS users DROP CONSTRAINT IF EXISTS chk_users_status;
ALTER TABLE IF EXISTS schedule DROP CONSTRAINT IF EXISTS uq_schedule_teacher_slot;
ALTER TABLE IF EXISTS enrollments DROP CONSTRAINT IF EXISTS uq_enrollments_student_year;
ALTER TABLE IF EXISTS classes DROP CONSTRAINT IF EXISTS chk_classes_capacity;
COMMIT;
