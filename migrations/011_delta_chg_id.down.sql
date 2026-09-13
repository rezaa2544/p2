-- Rollback of 008 (delta change-ID). Run BEFORE 008 if you want to abort, or
-- after (the sequence will simply restart from its retained position; the
-- values are opaque watermarks, not data — losing them is safe).
BEGIN;

DROP TRIGGER IF EXISTS trg_users_chg            ON users;
DROP TRIGGER IF EXISTS trg_classes_chg          ON classes;
DROP TRIGGER IF EXISTS trg_subjects_chg         ON subjects;
DROP TRIGGER IF EXISTS trg_schedule_chg         ON schedule;
DROP TRIGGER IF EXISTS trg_enrollments_chg      ON enrollments;
DROP TRIGGER IF EXISTS trg_attendance_chg       ON attendance;
DROP TRIGGER IF EXISTS trg_grades_chg           ON grades;
DROP TRIGGER IF EXISTS trg_discipline_chg       ON discipline;
DROP TRIGGER IF EXISTS trg_leaves_chg           ON leaves;
DROP TRIGGER IF EXISTS trg_notifications_chg    ON notifications;
DROP TRIGGER IF EXISTS trg_announcements_chg    ON announcements;
DROP TRIGGER IF EXISTS trg_hw_submissions_chg   ON hw_submissions;
DROP TRIGGER IF EXISTS trg_counselor_refs_chg   ON counselor_refs;
DROP TRIGGER IF EXISTS trg_counselor_msgs_chg   ON counselor_msgs;

DROP INDEX IF EXISTS idx_users_chg_id;
DROP INDEX IF EXISTS idx_classes_chg_id;
DROP INDEX IF EXISTS idx_subjects_chg_id;
DROP INDEX IF EXISTS idx_schedule_chg_id;
DROP INDEX IF EXISTS idx_enrollments_chg_id;
DROP INDEX IF EXISTS idx_attendance_chg_id;
DROP INDEX IF EXISTS idx_grades_chg_id;
DROP INDEX IF EXISTS idx_discipline_chg_id;
DROP INDEX IF EXISTS idx_leaves_chg_id;
DROP INDEX IF EXISTS idx_notifications_chg_id;
DROP INDEX IF EXISTS idx_announcements_chg_id;
DROP INDEX IF EXISTS idx_hw_submissions_chg_id;
DROP INDEX IF EXISTS idx_counselor_refs_chg_id;
DROP INDEX IF EXISTS idx_counselor_msgs_chg_id;

DROP FUNCTION IF EXISTS payesh_chg_bump();

ALTER TABLE users            DROP COLUMN IF EXISTS chg_id;
ALTER TABLE classes          DROP COLUMN IF EXISTS chg_id;
ALTER TABLE subjects         DROP COLUMN IF EXISTS chg_id;
ALTER TABLE schedule         DROP COLUMN IF EXISTS chg_id;
ALTER TABLE enrollments      DROP COLUMN IF EXISTS chg_id;
ALTER TABLE attendance       DROP COLUMN IF EXISTS chg_id;
ALTER TABLE grades           DROP COLUMN IF EXISTS chg_id;
ALTER TABLE discipline       DROP COLUMN IF EXISTS chg_id;
ALTER TABLE leaves           DROP COLUMN IF EXISTS chg_id;
ALTER TABLE notifications    DROP COLUMN IF EXISTS chg_id;
ALTER TABLE announcements    DROP COLUMN IF EXISTS chg_id;
ALTER TABLE hw_submissions   DROP COLUMN IF EXISTS chg_id;
ALTER TABLE counselor_refs   DROP COLUMN IF EXISTS chg_id;
ALTER TABLE counselor_msgs   DROP COLUMN IF EXISTS chg_id;

-- Sequence last: it may be referenced until the columns are gone.
DROP SEQUENCE IF EXISTS payesh_chg_seq;

COMMIT;
