-- Payesh migration 004: Wave 1 authority — version columns + outbox sequence
-- Immutable forward migration. Rollback: 004_wave1_version_seq.down.sql
-- Why: the SQL OCC path (UPDATE ... WHERE id=$id AND version=$base) needs a
-- `version` column on every VERSION_TRACKED table, and the outbox needs a
-- shared id sequence for multi-instance safety. All blocks are idempotent.
BEGIN;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='grades' AND column_name='version') THEN
    ALTER TABLE grades ADD COLUMN version INTEGER NOT NULL DEFAULT 1;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='attendance' AND column_name='version') THEN
    ALTER TABLE attendance ADD COLUMN version INTEGER NOT NULL DEFAULT 1;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='discipline' AND column_name='version') THEN
    ALTER TABLE discipline ADD COLUMN version INTEGER NOT NULL DEFAULT 1;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='schools' AND column_name='version') THEN
    ALTER TABLE schools ADD COLUMN version INTEGER NOT NULL DEFAULT 1;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='classes' AND column_name='version') THEN
    ALTER TABLE classes ADD COLUMN version INTEGER NOT NULL DEFAULT 1;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='subjects' AND column_name='version') THEN
    ALTER TABLE subjects ADD COLUMN version INTEGER NOT NULL DEFAULT 1;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='users' AND column_name='version') THEN
    ALTER TABLE users ADD COLUMN version INTEGER NOT NULL DEFAULT 1;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='enrollments' AND column_name='version') THEN
    ALTER TABLE enrollments ADD COLUMN version INTEGER NOT NULL DEFAULT 1;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='schedule' AND column_name='version') THEN
    ALTER TABLE schedule ADD COLUMN version INTEGER NOT NULL DEFAULT 1;
  END IF;
END $$;

CREATE SEQUENCE IF NOT EXISTS payesh_outbox_id_seq;

COMMIT;
