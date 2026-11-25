-- 029_audit_worm_fp.sql — M15-05: اثرِ انگشتِ payload برای import idempotent
-- ─────────────────────────────────────────────────────────────────────
-- مشکل: خطوطِ audit.log فاقدِ seq عددی‌اند (فقط timestamp ISO) و پس از
-- چرخشِ فایل، شمارهٔ خط جابه‌جا می‌شود. راه‌حل: هر رویداد با
-- fp = sha256(canonical(payload)) شناسایی می‌شود؛ import دوبارهٔ همان
-- خط = skip (idempotent)، رویدادِ تازه = seq جدیده از دنبالهٔ جدول.
-- Rollback: 029_audit_worm_fp.down.sql
BEGIN;
ALTER TABLE audit_events_worm ADD COLUMN IF NOT EXISTS fp TEXT;
-- یکتایی: هر payload فقط یک‌بار واردِ WORM می‌شود (re-run بی‌اثر)
CREATE UNIQUE INDEX IF NOT EXISTS audit_events_worm_fp_key ON audit_events_worm (fp);
-- فهرست fp برای عملیاتِ فقط-الحاق کافی است؛ خواندنش با SELECT مجاز
GRANT SELECT (fp) ON audit_events_worm TO PUBLIC;
COMMIT;
