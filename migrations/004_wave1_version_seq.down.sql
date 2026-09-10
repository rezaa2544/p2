-- Payesh migration 004 ROLLBACK: drop version columns + outbox sequence.
BEGIN;

DROP SEQUENCE IF EXISTS payesh_outbox_id_seq;

ALTER TABLE grades DROP COLUMN IF EXISTS version;
ALTER TABLE attendance DROP COLUMN IF EXISTS version;
ALTER TABLE discipline DROP COLUMN IF EXISTS version;
ALTER TABLE schools DROP COLUMN IF EXISTS version;
ALTER TABLE classes DROP COLUMN IF EXISTS version;
ALTER TABLE subjects DROP COLUMN IF EXISTS version;
ALTER TABLE users DROP COLUMN IF EXISTS version;
ALTER TABLE enrollments DROP COLUMN IF EXISTS version;
ALTER TABLE schedule DROP COLUMN IF EXISTS version;

COMMIT;
