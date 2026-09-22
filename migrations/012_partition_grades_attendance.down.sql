-- Rollback of 009 (partition grades + attendance). Valid ONLY during the bake
-- period while *_old still exists (Phase D drops them manually afterwards).
-- Swap back: partitioned tables are renamed away and dropped, old tables
-- (with their original indexes/sequences) return under their original names.
-- Rows written to the PARTITIONED tables after the swap are exported first
-- into *_recovered so nothing is silently lost — merge them by hand if any.
BEGIN;

DO $$
BEGIN
  IF NOT EXISTS (SELECT FROM pg_class WHERE relname = 'attendance_old')
     OR NOT EXISTS (SELECT FROM pg_class WHERE relname = 'grades_old') THEN
    RAISE EXCEPTION 'rollback of 009 requires attendance_old/grades_old (already dropped?)';
  END IF;
END $$;

-- نگهداریِ نوشته‌های پس از swap (اگر هست) پیش از حذفِ جدولِ پارتیشن‌شده
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_class WHERE relname = 'grades_recovered') OR
     EXISTS (SELECT 1 FROM pg_class WHERE relname = 'attendance_recovered') THEN
    RAISE EXCEPTION 'grades_recovered/attendance_recovered از وارون‌سازیِ قبلی مانده‌اند — اول محتوایشان را ادغام/بایگانی و جدول‌ها را دستی حذف کنید';
  END IF;
  IF to_regclass('mig009_w0') IS NULL THEN
    RAISE EXCEPTION 'rollback of 009 requires mig009_w0 recovery watermark';
  END IF;
  EXECUTE 'CREATE TABLE attendance_recovered AS
           SELECT n.* FROM attendance n
           WHERE n.chg_id IS NULL
              OR n.chg_id > (SELECT w0 FROM mig009_w0 WHERE id = 1)';
  EXECUTE 'CREATE TABLE grades_recovered AS
           SELECT n.* FROM grades n
           WHERE n.chg_id IS NULL
              OR n.chg_id > (SELECT w0 FROM mig009_w0 WHERE id = 1)';
END $$;

-- برگرداندنِ نام‌های نهایی به _old (برعکسِ swap)
ALTER INDEX idx_attendance_school_id        RENAME TO idx_attendance_p_school_id;
ALTER INDEX idx_attendance_school_student   RENAME TO idx_attendance_p_school_student;
ALTER INDEX idx_attendance_school_class     RENAME TO idx_attendance_p_school_class;
ALTER INDEX idx_attendance_school_class_date RENAME TO idx_attendance_p_school_class_date;
ALTER INDEX idx_attendance_created_at       RENAME TO idx_attendance_p_created_at;
ALTER INDEX idx_attendance_updated_at       RENAME TO idx_attendance_p_updated_at;
ALTER INDEX idx_attendance_school_date_id   RENAME TO idx_attendance_p_school_date_id;
ALTER INDEX idx_attendance_student_date_id  RENAME TO idx_attendance_p_student_date_id;
ALTER INDEX idx_attendance_chg_id           RENAME TO idx_attendance_p_chg_id;
ALTER INDEX idx_attendance_id               RENAME TO idx_attendance_p_id;
ALTER SEQUENCE attendance_id_seq            RENAME TO attendance_p_id_seq;

ALTER INDEX idx_grades_school_id            RENAME TO idx_grades_p_school_id;
ALTER INDEX idx_grades_school_student       RENAME TO idx_grades_p_school_student;
ALTER INDEX idx_grades_school_student_subject RENAME TO idx_grades_p_school_student_subject;
ALTER INDEX idx_grades_school_class         RENAME TO idx_grades_p_school_class;
ALTER INDEX idx_grades_created_at           RENAME TO idx_grades_p_created_at;
ALTER INDEX idx_grades_updated_at           RENAME TO idx_grades_p_updated_at;
ALTER INDEX idx_grades_school_id_id         RENAME TO idx_grades_p_school_id_id;
ALTER INDEX idx_grades_school_student_id    RENAME TO idx_grades_p_school_student_id;
ALTER INDEX idx_grades_chg_id               RENAME TO idx_grades_p_chg_id;
ALTER INDEX idx_grades_id                   RENAME TO idx_grades_p_id;
ALTER SEQUENCE grades_id_seq                RENAME TO grades_p_id_seq;

ALTER TABLE attendance RENAME TO attendance_p;
ALTER TABLE grades RENAME TO grades_p;

ALTER INDEX idx_attendance_old_school_id        RENAME TO idx_attendance_school_id;
ALTER INDEX idx_attendance_old_school_student   RENAME TO idx_attendance_school_student;
ALTER INDEX idx_attendance_old_school_class     RENAME TO idx_attendance_school_class;
ALTER INDEX idx_attendance_old_school_class_date  RENAME TO idx_attendance_school_class_date;
ALTER INDEX idx_attendance_old_created_at       RENAME TO idx_attendance_created_at;
ALTER INDEX idx_attendance_old_updated_at       RENAME TO idx_attendance_updated_at;
ALTER INDEX idx_attendance_old_school_date_id   RENAME TO idx_attendance_school_date_id;
ALTER INDEX idx_attendance_old_student_date_id  RENAME TO idx_attendance_student_date_id;
ALTER INDEX idx_attendance_old_chg_id           RENAME TO idx_attendance_chg_id;
ALTER SEQUENCE attendance_old_id_seq            RENAME TO attendance_id_seq;

ALTER INDEX idx_grades_old_school_id            RENAME TO idx_grades_school_id;
ALTER INDEX idx_grades_old_school_student       RENAME TO idx_grades_school_student;
ALTER INDEX idx_grades_old_school_student_subject RENAME TO idx_grades_school_student_subject;
ALTER INDEX idx_grades_old_school_class         RENAME TO idx_grades_school_class;
ALTER INDEX idx_grades_old_created_at           RENAME TO idx_grades_created_at;
ALTER INDEX idx_grades_old_updated_at           RENAME TO idx_grades_updated_at;
ALTER INDEX idx_grades_old_school_id_id         RENAME TO idx_grades_school_id_id;
ALTER INDEX idx_grades_old_school_student_id    RENAME TO idx_grades_school_student_id;
ALTER INDEX idx_grades_old_chg_id               RENAME TO idx_grades_chg_id;
ALTER SEQUENCE grades_old_id_seq                RENAME TO grades_id_seq;

ALTER TABLE attendance_old RENAME TO attendance;
ALTER TABLE grades_old RENAME TO grades;

-- حذفِ سازه‌های پارتیشن‌شده (پارتیشن‌ها با والدشان می‌روند)
DROP TABLE IF EXISTS attendance_p;
DROP TABLE IF EXISTS grades_p;

-- پاک‌سازیِ نشانگرِ مهاجرت باید پیش از COMMIT انجام شود تا migrate-ledger.js بتواند SQL rollback + ledger DELETE را در یک transaction نگه دارد.
DROP TABLE IF EXISTS mig009_w0;

-- جایگاهِ identity قدیمی را پیش ببر (نوشته‌های دورانِ پارتیشن)
SELECT setval(pg_get_serial_sequence('attendance', 'id'),
              COALESCE((SELECT MAX(id) FROM attendance), 0) + 1, false);
SELECT setval(pg_get_serial_sequence('grades', 'id'),
              COALESCE((SELECT MAX(id) FROM grades), 0) + 1, false);

COMMIT;

