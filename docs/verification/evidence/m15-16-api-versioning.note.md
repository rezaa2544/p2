# M15-16 — Versioning API: راستی‌آزماییِ روی HEAD

**تاریخ:** 2026-11-14 · **سوئیت:** release-version-contract exit 0 · **کد:** بدونِ تغییر (تحویلِ کاملِ موجود)

## نقشهٔ تحویلِ موجود (روی HEAD)

- **نسخه‌بندیِ مسیر:** همهٔ endpointsهای منبعِ RESTful زیر `/api/v1/*` (index.js L1392+) —
  bootstrap، pull، `reports/{attendance,academic,finance,teachers}` (Wave 23)،
  `analytics/*` (۱۲+ مسیرِ هوش‌محور) — A-35 rate-limitِ per-tenant روی کل `/api/v1/*`.
- **قراردادِ نسخهٔ انتشار:** `tests/release-version-contract.js` — تگ semver ↔
  package.json ↔ مستندات؛ هشدارهای نیازمندِ تصمیمِ مالک (A1) مستقل از گذشتنِ قرارداد گزارش می‌شوند.

## راستی‌آزماییِ روی HEAD (2026-11-14)

- `node tests/release-version-contract.js` → exit 0 («قرارداد نسخه برقرار است»)
- مسیرهای `/api/v1/*` در HEAD حاضرند و محدودِ tenant هستند (A-35 — نُتِ M15-14).

## نتیجه

نسخه‌بندیِ API به‌صورت مسیر (path-versioning) با قراردادِ خودکارِ سازگاریِ نسخه —
پوششِ کامل؛ هشدارِ A1 (تگ semver قدیمی‌تر از package.json) تصمیمِ مالک است
(release زدن) و در سوئیت صریحاً گزارش می‌شود.
