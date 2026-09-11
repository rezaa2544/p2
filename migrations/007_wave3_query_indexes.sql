-- ═══════════════════════════════════════════════════════════════════
-- 007_wave3_query_indexes.sql — Wave 3 keyset indexes, brought into
-- the migration chain
--
-- RENUMBERED 004 -> 007 (2026-09-11): it collided with
-- 004_wave1_version_seq.sql, violating the continuous-numbering rule in
-- docs/MIGRATION_GUIDE.md. 007 is the first free number (006 is taken by
-- 006_delta_schema_gaps). Safe to reorder: every statement is an
-- idempotent CREATE INDEX IF NOT EXISTS on tables created by 001, and no
-- other migration references these seven indexes. See
-- docs/MIGRATION_DECISION.md.
-- ───────────────────────────────────────────────────────────────────
-- server/schema.sql has carried these seven indexes since Wave 3
-- (idx_users_school_role_id … idx_classes_school_grade_id), but the
-- migrations/ chain never did. A database provisioned from migrations/
-- therefore had NONE of them, and the DB-native list queries degraded to
-- filter-only scans.
--
-- Measured on a live PostgreSQL 18.4 with 2.19M rows (60k students,
-- 720k grades, 1.2M attendance), BEFORE this migration:
--
--   grades page (manager scope, LIMIT 51, ORDER BY g.id DESC)
--     Index Scan Backward using grades_pkey
--       Filter: ((school_id IS NULL) OR (school_id = 1))
--       Rows Removed by Filter: 648000      <-- walked the whole table
--       Buffers: shared hit=7831
--     Execution Time: 114.3 ms
--
-- `school_id` was a Filter, never an Index Cond, so the planner had to
-- walk the primary key backwards discarding nine other schools' rows.
--
-- Every statement is idempotent (IF NOT EXISTS) and safe to re-run.
-- CONCURRENTLY is deliberately NOT used: migrations run inside a
-- transaction and CREATE INDEX CONCURRENTLY cannot. On a production
-- database with live traffic, apply these by hand with CONCURRENTLY.
-- ═══════════════════════════════════════════════════════════════════
BEGIN;

-- students list: WHERE role='student' AND school scope, ORDER BY id
CREATE INDEX IF NOT EXISTS idx_users_school_role_id ON users (school_id, role, id);
-- superadmin / role-first filtering
CREATE INDEX IF NOT EXISTS idx_users_role_school_id ON users (role, school_id, id);

-- attendance list: school scope + ORDER BY date DESC, id ASC
CREATE INDEX IF NOT EXISTS idx_attendance_school_date_id ON attendance (school_id, date DESC, id);
-- attendance list: student (and parent-via-EXISTS) scope
CREATE INDEX IF NOT EXISTS idx_attendance_student_date_id ON attendance (student_id, date DESC, id);

-- grades list: school scope + ORDER BY id DESC (the 114 ms query above)
CREATE INDEX IF NOT EXISTS idx_grades_school_id_id ON grades (school_id, id DESC);
-- grades list: student / parent scope + ORDER BY id DESC
CREATE INDEX IF NOT EXISTS idx_grades_school_student_id ON grades (school_id, student_id, id DESC);

-- classes list: school scope + grade filter + ORDER BY id ASC
CREATE INDEX IF NOT EXISTS idx_classes_school_grade_id ON classes (school_id, grade, id);

COMMIT;
