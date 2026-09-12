-- Payesh migration 009: report_logs CHECK constraints (P1-2)
-- Immutable forward migration. Rollback: 009_report_logs_constraints.down.sql
--
-- WHY: migration 008 created report_logs with free VARCHAR columns. The
-- writing surfaces are closed-world enums in code, so the table should
-- enforce them (defence in depth for the sync path, which accepts client
-- rows model-driven):
--   kind   : attendance | academic | finance | teachers
--            (REPORT_ROLES keys in server/routes/reports.js:62 and the four
--             tabs of src/js/77-reports.js)
--   format : csv | pdf
--            (the only writer is rptLog() in src/js/77-reports.js, called
--             exactly as rptLog('csv') and rptLog('pdf'); the official
--             contract in docs/REPORTING_SYSTEM_GUIDE.md:86 says
--             «format: 'csv|pdf'». The word «screen» appears ONLY in a
--             comment of migration 008 — no code path ever writes it, so it
--             is deliberately NOT allowed here; see WAVE23 docs note.)
--   status : generated | synced
--            (client writes 'generated' — 77-reports.js:206; 'synced' is the
--             post-sync state named by the 008 contract and the guide)
--   generated_by : digits-only TEXT or NULL
--            (writer is String(S.user.id) — 77-reports.js:207; NULL allowed
--             for legacy/system rows, mirror of registered_by policy)
--
-- All constraints are added as NOT VALID + VALIDATE so the migration also
-- applies cleanly on a database that already carries rows: existing valid
-- rows validate, and any pre-existing garbage would fail loudly here rather
-- than silently poisoning reports (fail-closed, same honesty policy as the
-- rest of this chain). On the seed dataset report_logs rows all conform.
--
-- CONCURRENTLY is deliberately NOT used (same policy as 004..008):
-- migrations run inside a transaction. VALIDATE CONSTRAINT takes only a
-- SHARE UPDATE EXCLUSIVE lock, so it is production-friendly by design.
BEGIN;

ALTER TABLE report_logs
  ADD CONSTRAINT chk_report_logs_kind
  CHECK (kind IS NULL OR kind IN ('attendance', 'academic', 'finance', 'teachers'))
  NOT VALID;

ALTER TABLE report_logs
  ADD CONSTRAINT chk_report_logs_format
  CHECK (format IS NULL OR format IN ('csv', 'pdf'))
  NOT VALID;

ALTER TABLE report_logs
  ADD CONSTRAINT chk_report_logs_status
  CHECK (status IS NULL OR status IN ('generated', 'synced'))
  NOT VALID;

ALTER TABLE report_logs
  ADD CONSTRAINT chk_report_logs_generated_by
  CHECK (generated_by IS NULL OR generated_by ~ '^[0-9]+$')
  NOT VALID;

ALTER TABLE report_logs VALIDATE CONSTRAINT chk_report_logs_kind;
ALTER TABLE report_logs VALIDATE CONSTRAINT chk_report_logs_format;
ALTER TABLE report_logs VALIDATE CONSTRAINT chk_report_logs_status;
ALTER TABLE report_logs VALIDATE CONSTRAINT chk_report_logs_generated_by;

-- P1-3: tenant/delta composite indexes — proven on live PG 18.4 before
-- being added here (rule: «ایندکس جدید فقط با اثبات»). Benchmark
-- 2026-09-12, EXPLAIN (ANALYZE, BUFFERS) + 30-iteration timing:
--   report_logs 60k rows, tenant list (school_id=$1 ORDER BY updated_at
--     DESC, id DESC LIMIT 50):        0.135ms → 0.073ms (bench 1.16→0.53ms)
--   attendance 36k rows, tenant delta (school_id=$1 AND changed>since
--     ORDER BY updated_at,id LIMIT 101): Seq Scan 15.2ms → Index 0.121ms
--   grades 157k rows, same shape:      Parallel Seq 47.2ms → Index 0.101ms
--   (the ordered composite lets the LIMIT terminate early — the plain
--    updated_at indexes of 005 cannot serve school_id + order together)
-- HONESTY / NOT-HELPED: the *global* delta shape currently used by
-- server/pull.js (deltaRowsSql — no school_id in SQL, tenant filter in JS)
-- does NOT benefit (10.2ms → 9.5ms, planner keeps idx_*_updated_at).
-- These composites serve the tenant-scoped list/delta shapes (dbquery
-- builders and the per-tenant delta the pull path is expected to move to).
CREATE INDEX IF NOT EXISTS idx_report_logs_school_updated_id
  ON report_logs (school_id, updated_at, id);
CREATE INDEX IF NOT EXISTS idx_attendance_school_updated_id
  ON attendance (school_id, updated_at, id);
CREATE INDEX IF NOT EXISTS idx_grades_school_updated_id
  ON grades (school_id, updated_at, id);

COMMIT;
