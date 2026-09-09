# گزارش نهایی چت ۴ — Version Vectors برای Offline-First Conflicts

تاریخ: 2026-09-09  
شاخه: `arena/01a08527-p2`

## خلاصه

Version Vector برای مسیر همگام‌سازی offline-first پیاده شد تا علاوه بر `base_version` عددی، وضعیت causality هر رکورد با `base_vector` و `version_vector` قابل تشخیص باشد. رفتار سازگار قبلی حفظ شده است: کلاینت‌های قدیمی که `base_vector` نمی‌فرستند همچنان با منطق `base_version` کار می‌کنند.

## تغییرات اصلی

- `server/version-vector.js`: هستهٔ pure شامل `mergeVectors`، `isAncestor`، `compareVectors`، `bumpVector`، `validateVector` و `resolveConflict`.
- `server/sync.js`: پذیرش و اعتبارسنجی `base_vector`، تشخیص تعارض برداری، ثبت metadata برداری در `sync_conflicts`، bump کردن `version_vector` سروری، و حفظ رفتار قبلی `base_version`.
- `server/validate.js`: مجاز شدن کلید top-level `base_vector` در پاکت sync.
- `src/js/03-persistence.js` و `src/js/27-sync.js`: ارسال `base_vector` برای رکوردهای دارای vector معتبر و حذف فیلدهای مدیریت‌شده از `op.data`.
- `tools/migrate-to-pg.js` و `server/schema.sql`: پشتیبانی ستون‌های `version` و `version_vector JSONB` برای مجموعه‌های version-tracked.
- `docs/VERSION_VECTORS.md`: سند طراحی، قرارداد sync، سیاست conflict، سازگاری و runbook.
- تست‌های تازه: `tests/version-vector.js` و `tests/version-vector-sync.js`.

## سیاست conflict

- `base_vector` اگر وجود داشته باشد، مرجع اصلی تشخیص conflict است.
- در `grades`، `attendance` و `discipline` اختلاف بردار باعث `conflict_preserved` و ثبت در `sync_conflicts` می‌شود.
- در مجموعه‌های ساختاری (`schools`، `classes`، `subjects`، `users`، `enrollments`، `schedule`) اختلاف بردار با `stale_base` رد می‌شود و conflict دستی ساخته نمی‌شود.
- اگر `base_vector` وجود نداشته باشد، رفتار legacy بر پایهٔ `base_version` حفظ می‌شود.
- `version` و `version_vector` داخل `op.data` از کلاینت پذیرفته نمی‌شود؛ فقط top-level `base_vector` معتبر است.

## نتایج آزمون‌ها

- `node build.js --check` ✅
- `node tools/check-authz.js` ✅
- `node tests/secret-scan.js` ✅ 11/11
- `node tests/version-vector.js` ✅ 8/8
- `node tests/version-vector-sync.js` ✅ 6/6
- `node tests/server15.js` ✅ 40/40
- `node tests/server18.js` ✅ 55/55
- `node tests/weighted-partitioning.js` ✅ 12/12
- `node tests/pgbouncer-pooling.js` ✅ 12/12
- `node --expose-gc --max-old-space-size=2048 tests/smoke.js` ✅ 547/547

تنها هشدار smoke همان هشدار شناخته‌شدهٔ محیط jsdom برای `Window.scrollTo()` بود.

## وضعیت پوش

کار روی شاخهٔ `arena/01a08527-p2` انجام شد و پس از کامیت نهایی به `origin/arena/01a08527-p2` پوش می‌شود.
