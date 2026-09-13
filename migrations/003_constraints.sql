-- Payesh migration 003: core data invariants / constraints
-- Immutable forward migration. Rollback: 003_constraints.down.sql
-- Notes: each block is idempotent and checks pg_constraint before ALTER TABLE.
BEGIN;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'chk_classes_capacity') THEN
    ALTER TABLE classes ADD CONSTRAINT chk_classes_capacity CHECK (capacity > 0);
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'uq_enrollments_student_year') THEN
    ALTER TABLE enrollments ADD CONSTRAINT uq_enrollments_student_year UNIQUE (student_id, year);
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'uq_schedule_teacher_slot') THEN
    ALTER TABLE schedule ADD CONSTRAINT uq_schedule_teacher_slot UNIQUE (teacher_id, day, period);
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'chk_users_status') THEN
    ALTER TABLE users ADD CONSTRAINT chk_users_status CHECK (status IN ('active', 'dropped_out', 'graduated', 'awaiting_transfer'));
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fk_grades_student') THEN
    ALTER TABLE grades ADD CONSTRAINT fk_grades_student FOREIGN KEY (student_id) REFERENCES users(id) ON DELETE CASCADE DEFERRABLE INITIALLY DEFERRED;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fk_grades_class') THEN
    ALTER TABLE grades ADD CONSTRAINT fk_grades_class FOREIGN KEY (class_id) REFERENCES classes(id) ON DELETE CASCADE DEFERRABLE INITIALLY DEFERRED;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fk_grades_subject') THEN
    ALTER TABLE grades ADD CONSTRAINT fk_grades_subject FOREIGN KEY (subject_id) REFERENCES subjects(id) ON DELETE CASCADE DEFERRABLE INITIALLY DEFERRED;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fk_grades_teacher') THEN
    ALTER TABLE grades ADD CONSTRAINT fk_grades_teacher FOREIGN KEY (teacher_id) REFERENCES users(id) ON DELETE CASCADE DEFERRABLE INITIALLY DEFERRED;
  END IF;
END $$;

COMMIT;
