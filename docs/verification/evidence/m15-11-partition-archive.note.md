# M15-11 — آرشیو داده + partitioning (مقیاس 10M+) — evidence note

تاریخ: 2026-11-14 · HEADِ شواهد: کامیتِ m15-11 (رجیستریِ دو-فازه به همان head بسته می‌شود)

## CLAIM
«آرشیو داده + partitioning» صفِ Notion روی Current HEAD برقرار است: پارتیشن‌بندیِ بومیِ declarative (بدونِ pg_partman — تصمیمِ مستند، چون پسوند در ایمیجِ رسمیِ postgres:17/18 نیست و وابستگیِ سفارشی = مداخلهٔ مالک) + آرشیوِ fail-closedِ پارتیشن‌های کهنه.

## EVIDENCE (تحویلِ موجود + اثباتِ منفیِ تازه)
- **پارتیشن‌بندی**: `migrations/012_partition_grades_attendance.sql` (RANGE (created_at) سالانه + DEFAULT، سواپِ دو-فازیِ zero-downtime، کپیِ chunk-commitِ قابلِ ازسرگیری، chg_id/version) — طراحیِ کامل: docs/WAVE10_DB_SCALE.md §۳/§۷؛ مانورِ ۲۵M سطر: §۹.۷.
- **روتینگِ lایهٔ DB**: `server/db.js` persistOp = UPDATE(id)→INSERT با 23505 برای جدول‌های پارتیشن‌شده (db.js:862-881) —阻断ِ upsertِ ON CONFLICT حل شده.
- **آرشیو/retention**: `tools/partition-retention.js` — سیاستِ نگهداریِ N سال، فقطِ الگوی `<t>_y<YYYY>`، هرگزِ default/امسال/آینده، `--archive-dir` با pg_dump پیش از حذف، fail-closed (شکستِ بایگانی ⇒ حذف نه)، dry-run پیش‌فرض، cron در infra/cron (M12-F1). ران‌بوک: §۹.۶.
- **سوئیتِ پارتیشن‌بندی**: tests/partitioning.js — واحدِ 25/25 روی Current HEAD (هم در CI هر push سبز، هم محلی 2026-11-14). بخشِ زندهٔ L (62/62 تاریخی) به هارنسِ استیجینگِ §۹.۱ (WSL + sudo) نیاز دارد — اینجا BLOCKED (WSL sudo رمز می‌خواهد)؛ مانعِ غیرِمسدودکننده: CI همان بخشِ واحد را گیت می‌گیرد.
- **اثباتِ منفیِ تازه (این کامیت)**: tests/partition-retention-mutations.js + tests/helpers/retention-fake-pg.js — چهار نگهبانِ fail-closed جهش داده شدند و هر چهار کشته شدند:
  - M1 گاردِ relkind خاموش + جدولِ عادی (relkind='r') → DROP آشکار شد (کنترلِ M0e: با گاردِ روشن همان سناریو رد می‌شود)
  - M2 گاردِ الگوی نام خاموش (regex گشاد) → DROPِ پارتیشنِ DEFAULT آشکار شد
  - M3 گاردِ سالِ جاری خاموش → DROPِ پارتیشنِ امسال آشکار شد
  - M4 fail-closedِ بایگانی خاموش → حذف باوجودِ شکستِ pg_dump آشکار شد
  - کنترل‌ها: dry-run بدونِ حذف (M0a-d) — نتیجه: **9/9 سبز، exit 0**
- sha256 سورسِ ابزار پیش/پسِ جهش = یکسان (کپیِ هم‌جوار، الگوی BH-mut).

## SCOPE / OWNERSHIP
هیچ تغییر رفتاری در کدِ سرور نیست — این کامیت فقط آزمونِ اثباتِ منفی برای ابزارِ آرشیو + مستندسازی است. pg_partman به‌عنوان بهینه‌سازیِ اختیاریِ آینده (وابسته به دسترسیِ مالک به ایمیجِ سفارشی) ثبت می‌شود.

## NOT VERIFIED
بخشِ زندهٔ L روی PG واقعی در THIS environment (نیازمند هارنسِ استیجینگ WSL) — آخرین 62/62 زنده در §۹.۳ ثبت تاریخی است؛ CI-unit روی Current HEAD معتبر.
