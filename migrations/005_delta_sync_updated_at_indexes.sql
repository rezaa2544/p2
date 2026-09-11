-- Payesh migration 005: delta-sync updated_at indexes (Delta Hardening Phase 2, gap 3)
-- Immutable forward migration. Rollback: 005_delta_sync_updated_at_indexes.down.sql
--
-- WHY: the delta pull (server/syncdelta.js → pull.js) predicates on
--   (created_at > $since OR updated_at > $since) ORDER BY updated_at, id.
-- Migration 002 indexed created_at on six tables but NOTHING indexed
-- updated_at — the column the delta ORDER BY sorts on and half the OR
-- predicate. Measured on live PostgreSQL 18.4 (923,292-row fixture,
-- 2026-09-11): Parallel Seq Scan on grades, 37.4ms per delta query,
-- Rows Removed by Filter ≈ 106,590; under a 1000-request burst the
-- 20-conn pool saturated (peak waiting 979, p50 ≈ 4.0s).
--
-- These single-column btree indexes on updated_at give the planner a
-- BitmapOr path (created_at idx ∪ updated_at idx) for the OR predicate
-- and an ordered scan source for the ORDER BY. Tables are exactly the
-- pull collections (server/pull.js ALL_COLLECTIONS) that exist in this
-- migration chain and carry updated_at:
--   homework → absent (chain models it as hw_assignments) — noted gap
--   vclass_rooms → absent from the chain — noted gap
--   sync_conflicts → no updated_at column — noted gap
--
-- CONCURRENTLY is deliberately NOT used (same policy as 004): migrations
-- run inside a transaction and CREATE INDEX CONCURRENTLY cannot. Apply
-- by hand with CONCURRENTLY on a production database with live traffic.
BEGIN;
CREATE INDEX IF NOT EXISTS idx_schools_updated_at          ON schools         (updated_at);
CREATE INDEX IF NOT EXISTS idx_users_updated_at            ON users           (updated_at);
CREATE INDEX IF NOT EXISTS idx_classes_updated_at          ON classes         (updated_at);
CREATE INDEX IF NOT EXISTS idx_subjects_updated_at         ON subjects        (updated_at);
CREATE INDEX IF NOT EXISTS idx_schedule_updated_at         ON schedule        (updated_at);
CREATE INDEX IF NOT EXISTS idx_enrollments_updated_at      ON enrollments     (updated_at);
CREATE INDEX IF NOT EXISTS idx_attendance_updated_at       ON attendance      (updated_at);
CREATE INDEX IF NOT EXISTS idx_grades_updated_at           ON grades          (updated_at);
CREATE INDEX IF NOT EXISTS idx_discipline_updated_at       ON discipline      (updated_at);
CREATE INDEX IF NOT EXISTS idx_leaves_updated_at           ON leaves          (updated_at);
CREATE INDEX IF NOT EXISTS idx_notifications_updated_at    ON notifications   (updated_at);
CREATE INDEX IF NOT EXISTS idx_announcements_updated_at    ON announcements   (updated_at);
CREATE INDEX IF NOT EXISTS idx_hw_submissions_updated_at   ON hw_submissions  (updated_at);
CREATE INDEX IF NOT EXISTS idx_bell_schedules_updated_at   ON bell_schedules  (updated_at);
CREATE INDEX IF NOT EXISTS idx_counselor_refs_updated_at   ON counselor_refs  (updated_at);
CREATE INDEX IF NOT EXISTS idx_counselor_msgs_updated_at   ON counselor_msgs  (updated_at);
COMMIT;
