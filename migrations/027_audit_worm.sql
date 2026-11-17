-- 027_audit_worm.sql — M15-05: جدولِ audit فقط-الحاق (WORM) با زنجیرهٔ hash
-- ─────────────────────────────────────────────────────────────────────
-- منبعِ زندهٔ audit = فایلِ append-only (server/audit.js، 0o600)؛ این جدول
-- «آینهٔ ضد-دستکاری» در PG است که ابزارِ ingestion آن را تغذیه می‌کند:
--   * REVOKE UPDATE/DELETE + trigger = هرگونه دستکاری مستقیم = خطای بلند
--   * زنجیرهٔ hash (sha256(prev_hash || canonical)) = کشفِ حذف/جای‌گذاریِ ردیف
-- Rollback: 027_audit_worm.down.sql
BEGIN;
CREATE TABLE IF NOT EXISTS audit_events_worm (
  id         BIGSERIAL PRIMARY KEY,
  ts         TIMESTAMPTZ NOT NULL DEFAULT now(),
  seq        BIGINT NOT NULL UNIQUE,
  actor      TEXT,
  action     TEXT NOT NULL,
  payload    JSONB NOT NULL,
  prev_hash  TEXT NOT NULL,
  hash       TEXT NOT NULL
);
REVOKE UPDATE, DELETE ON audit_events_worm FROM PUBLIC;
CREATE OR REPLACE FUNCTION payesh_worm_guard() RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION 'AUDIT_WORM_IMMUTABLE: جدولِ audit فقط-الحاق است — % ممنوع', TG_OP;
END;
$$ LANGUAGE plpgsql;
DROP TRIGGER IF EXISTS audit_events_worm_no_update ON audit_events_worm;
CREATE TRIGGER audit_events_worm_no_update
  BEFORE UPDATE ON audit_events_worm
  FOR EACH ROW EXECUTE FUNCTION payesh_worm_guard();
DROP TRIGGER IF EXISTS audit_events_worm_no_delete ON audit_events_worm;
CREATE TRIGGER audit_events_worm_no_delete
  BEFORE DELETE ON audit_events_worm
  FOR EACH ROW EXECUTE FUNCTION payesh_worm_guard();
COMMIT;
