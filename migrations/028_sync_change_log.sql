-- ═══════════════════════════════════════════════════════════════
-- 028_sync_change_log.sql — جدول sync_change_log: لاگ تغییرِ seq-دار برای همگام‌سازی لاگ‌مبنا (WP-06 / #434)
-- ───────────────────────────────────────────────────────────────
-- چرا: مسیرِ pull/delta اکنون undo-log مبناست (server/sync.js پلِ P0-6،
--       O(batch) روی کل استور). در مقیاس ملی (Wave 18 مدل: ۲۵۰۰ نوشت/ثانیه
--       اوج) خوانندهٔ delta باید روی یک جریانِ مونوتونِ seq کار کند نه
--       پویشِ کل استور. این جدولِ فقط-الحاق، cursorِ سازگارِ رو به عقب
--       می‌سازد: هر نوشتِ persistOpsBatch یک سطر لاگ در همان تراکنش می‌نویسد
--       (الگوی cache-invalidation-events — شکستِ append = رول‌بکِ کل
--       تراکنش، بدون شکستگی بین داده و لاگ).
--
-- قرارداد (docs/MIGRATION_GUIDE.md §۱ و §۷.۱):
--   • توان‌پذیر: هر DDL با IF [NOT] EXISTS
--   • تراکنشی: BEGIN; … COMMIT;
--   • بدونِ DROP TABLE — انقباض (retention) ابزارِ دوره‌ای است نه مهاجرت
--   • tenant isolation: سطرها school_id دارند؛ هر پرس‌وجوی خواننده
--     ملزم به فیلترِ school_id است (گارد PHASE6 — جهشِ حذفِ فیلتر = قرمز)
-- ═══════════════════════════════════════════════════════════════
BEGIN;

CREATE TABLE IF NOT EXISTS sync_change_log (
  id          BIGSERIAL PRIMARY KEY,
  seq         BIGINT NOT NULL DEFAULT nextval('sync_change_log_id_seq'),
  collection  TEXT   NOT NULL,
  record_id   TEXT   NOT NULL,
  school_id   BIGINT,
  op          TEXT   NOT NULL CHECK (op IN ('ins','upd','del')),
  version     BIGINT,
  at          TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- seq باید همان id باشد (پیمایشِ مونوتون ساده و بدونِ gap)
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_sequences WHERE schemaname='public' AND sequencename='sync_change_log_id_seq') THEN
    CREATE SEQUENCE IF NOT EXISTS sync_change_log_id_seq OWNED BY sync_change_log.id;
  END IF;
END $$;

-- خوانندهٔ cursor: پیمایش per-collection (شکاف = گم‌شدن رویداد)
CREATE INDEX IF NOT EXISTS idx_sync_change_log_collection_seq ON sync_change_log (collection, id);
-- خوانندهٔ per-tenant: هر سؤال لاگ با school_id فیلتر می‌شود (PHASE6)
CREATE INDEX IF NOT EXISTS idx_sync_change_log_school_seq ON sync_change_log (school_id, id);

COMMIT;
