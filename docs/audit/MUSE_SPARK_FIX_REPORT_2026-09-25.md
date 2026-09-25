# گزارش رفع ایرادات توسط Muse Spark — 2026-09-25
HEAD پایه: `145088f3` — `docs: add A-37 A-38 A-39 test and DR acceptance criteria`
شاخه: `main` — بدون ارتقای status و بدون ادعای Gate.

## چه چیزهایی رفع شد (کد + مستندات + تست)
1. C-01 (دریفت واقعی): ۸ مسیر Phase 9.0 به `docs/openapi.yaml` اضافه شد → `tools/openapi-drift.js`: 91/91 صفر دریفت ✅
2. C-01 (عدد جادویی ۳۱): `tests/openapi-drift.js` و `tools/openapi-validate.js` و `tests/openapi-spec.js` دیگر عدد ثابت ندارند؛ با خروجی ابزار مقایسه می‌کنند ✅
3. C-02 (کلید تکراری YAML): دو `description` به دو تگ جدا (`observability` سلامت، `analytics` هوشمندی) تفکیک شد ✅
4. C-03 (لایسنس): `openapi.yaml` به MIT + opensource.org هم‌راستا با `package.json` شد ✅
5. L-01/L-02: سرورها به `example.invalid` (رزرو RFC) + حذف `arena.ai` و `example.ir` + یادداشت صادقانه ✅
6. H-01: سطرهای `بدون بک‌اند / بدون رمز` در `ARCHITECTURE.md` اصلاح شد (کلاینت آفلاین، سرور جداگانه با JWT) ✅
7. H-02+M-06: سکرت مثال به `CHANGE_ME` + مستندسازی `PAYESH_WAF_MODE / PAYESH_TEST_SLOW_MS / PAYESH_BUILD_NO_CACHE / PGURL` در `.env.example` ✅
8. H-03: `API_REFERENCE` (جمع پایه ۲۶/۳۱ + جمع جاری ~۸۶/~۹۱) و `API_CHANGELOG` (§۴.۳ + فرمول جمع از ابزار) به‌روز شد ✅
9. H-04: `__slow` در ابزار و تست allowlist صریح شد (env-gated) ✅
10. M-08/M-04: ۸ مسیر معنایی به `ROUTE_EXACT` در `server/metrics.js` اضافه شد (دیگر `api_unmatched` نمی‌گیرند) ✅
11. M-09: `guard: 1` به `ROLE_LEVEL` در `server/sync.js` اضافه شد ✅
12. M-07: کامنت گمراه‌کننده `fail-open` در `waf.js` به قرارداد واقعی (هرگز throw) اصلاح شد — بدون تغییر رفتار ✅
13. L-06: پیام `Node >= 22.22` به `>= 22.0.0` اصلاح شد ✅
14. L-04/L-05: دو تست آفلاین برای `sw.js` و `manifest.json` به `tests/run.js` اضافه شد و سبزند ✅
15. L-03: بررسی شد — `.build-cache.*` و `dist/` در `.gitignore` هستند ✅

## چه چیزهایی عمداً دست نخورد (نیازمند تصمیم بیرونی)
- H-05 (کثیف‌شدن درخت با `npm test`): چون `tests/run.js` آگاهانه اول `--check` بعد `build` می‌کند؛ تغییرش قرارداد C1-05 را می‌شکند. فقط ثبت شد.
- H-06 (۷ PR draft باز): ادغام/بستن PR حق مالک مخزن است، نه عامل.
- H-07/CI روی HEAD دقیق: نیازمند اجرای Actions روی SHA جدید (پس از push همین تغییرات).
- M-01 (ریشه scope مشترک): نیازمند بازطراحی build؛ فقط نگهبان‌ها سبز نگه داشته شدند.
- M-02 (یتیم `.mjs`/زیرپوشه): تست فعلی فقط سطح `src/js` را می‌بیند؛ تعمیمش ریسک فالس‌پازیتیو دارد — ثبت شد.
- M-03 (تک‌فایل ۱۱۴KB): تست require-graph اضافه نشد تا قرارداد تست موجود نشکند.
- M-05 (بدهی ریشه): جابه‌جایی گزارش‌ها نیازمند audit لینک‌هاست (خود GOVERNANCE منع کرده).
- E4 (alert واقعی، restore چندمیزبانه، بار ۱۰M): نیازمند محیط production-equivalent و مالک بیرونی.

## شواهد اجرا (همین ماشین، Node v24.21.0)
- `node p2/tools/openapi-drift.js` → 91/91 صفر دریفت، exit 0 ✅
- `node p2/tests/openapi-drift.js` → 9/9 ✅
- `node p2/tests/openapi-spec.js` → 66/66 ✅
- `node p2/tools/openapi-validate.js` → 28/28 سطح پایه ✅
- `node p2/tests/migration-sequence.js` → 19/19 ✅
- `node p2/tests/check-authz.js` → 6/6 ✅
- `node p2/tests/run.js` → 36/37؛ تنها قرمزی `build --check` است که ریشه‌اش CRLF ویندوز است (پایین)، نه تغییرات من.
- `git -C p2 status --porcelain` → ۱۴ فایل Modified، بدون فایل جدید ناخواسته، `index.html` دست‌نخورده.

## یافتهٔ جدید وسط کار (H-08 — Tandis، بحرانیِ محیطی، نه کد)
- `node p2/build.js --check` روی همین کلون ویندوزی قرمز است: `index.html` کامیت‌شده با CRLF (`\r\n`) است ولی خروجی بیلد LF (`\n`) می‌دهد (کاراکتر ۴۸۳). طول اصلی 1578295 در برابر ساخته‌شده 1552932.
- این یعنی گیتِ `build --check` روی ویندوز بدون `core.autocrlf=false` یا `.gitattributes` همیشه قرمز کاذب می‌دهد. روی لینوکس/CI (مخزن LF است) سبز می‌شود.
- رفع پیشنهادی (انجام نشد — نیازمند تصمیم مالک چون کل مخزن را لمس می‌کند): افزودن `.gitattributes` با `* text=auto eol=lf` + نرمال‌سازی یک‌باره `index.html`. تا آن زمان: روی ویندوز `git config core.autocrlf false` و `git checkout -- index.html` بعد از هر `npm test`.
- این مورد در `tests/run.js` هم همان تنها قرمزی است؛ پس ۳۶ تست دیگر که سبزند، تغییرات من را تأیید می‌کنند.

## فایل‌های تغییرکرده (۱۴)
`.env.example`, `docs/API_CHANGELOG.md`, `docs/API_REFERENCE.md`, `docs/ARCHITECTURE.md`, `docs/openapi.yaml`, `server/metrics.js`, `server/sync.js`, `server/waf.js`, `tests/openapi-drift.js`, `tests/openapi-spec.js`, `tests/run.js`, `tests/smoke.js`, `tools/openapi-drift.js`, `tools/openapi-validate.js` + همین گزارش `docs/audit/MUSE_SPARK_FIX_REPORT_2026-09-25.md`.
وضعیت Gate: بدون تغییر — Phase 8.2 Exit همچنان NOT VERIFIED و Production GO همچنان NOT DECLARED.
