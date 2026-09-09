-- Payesh migration 002: workload indexes for national baseline
-- Immutable forward migration. Rollback: 002_indexes.down.sql
-- Notes: all statements are IF NOT EXISTS, safe after 001_initial.sql.
BEGIN;
CREATE INDEX IF NOT EXISTS idx_users_school_role ON users (school_id, role);
CREATE INDEX IF NOT EXISTS idx_attendance_school_class_date ON attendance (school_id, class_id, date);
CREATE INDEX IF NOT EXISTS idx_grades_school_student_subject ON grades (school_id, student_id, subject_id);
CREATE INDEX IF NOT EXISTS idx_schedule_school_teacher_day ON schedule (school_id, teacher_id, day);
CREATE INDEX IF NOT EXISTS idx_parent_links_parent_student ON parent_links (parent_id, student_id);
CREATE INDEX IF NOT EXISTS idx_messages_to_from ON messages (to_id, from_id);
CREATE INDEX IF NOT EXISTS idx_notifications_user_read ON notifications (user_id, read);
CREATE INDEX IF NOT EXISTS idx_sync_conflicts_school_status ON sync_conflicts (school_id, status);
CREATE INDEX IF NOT EXISTS idx_schools_capabilities ON schools USING GIN (capabilities);
COMMIT;
