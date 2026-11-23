-- Rollback for 028_sync_change_log.sql
-- پس از نوشتنِ داده، این بازگشت تاریخچهٔ تغییرِ جدولِ sync_change_log را
-- از دست می‌دهد (راهنما §۴) — جدول فقط-الحاق است و خوانندهٔ delta به
-- undo-log مسیرِ قدیمی fallback می‌کند (PAYESH_SYNC_LOG=off همان است).
BEGIN;

DROP INDEX IF EXISTS idx_sync_change_log_school_seq;
DROP INDEX IF EXISTS idx_sync_change_log_collection_seq;
DROP TABLE IF EXISTS sync_change_log;
DROP SEQUENCE IF EXISTS sync_change_log_id_seq;

COMMIT;
