# سفت‌کردن CI — ردیف ۵۰ (zizmor + پینِ SHA + gitleaks با baseline) — ۲۰۲۶-۱۱-۲۷

> **Scope:** فقط `.github/**` — تغییرِ کدِ محصول ممنوع (پایبند شد). ابزار: zizmor 1.33.1 (MIT) + gitleaks 8.30.1 (MIT) — باینری رایگان، بدون اکشنِ مارکت‌پلیسِ لایسنس‌دار. HEAD پایه: `c8b4e207`.

## ۱) پین‌کردن اکشن‌ها به SHA — کامل
- ۱۴ وورک‌فلو؛ ۱۶ رفرنس اکشن: قبلاً ۶ مورد SHA-pinned بود، **۹ تگِ متغیر** (checkout/setup-dotnet/setup-node/upload-artifact×2/codeql/security-devops/setup-msbuild/zaproxy) به commit-SHA واقعیِ همان تگ رزولوشن و پین شدند (کامنتِ حفظِ تگ). بعد از پین: **۰ رفرنس متغیر باقی ماند**.

## ۲) zizmor — از ۳۲ یافته به صفر
| مرحله | یافته | اقدام |
|---|---|---|
| قبل از اصلاح | 32 (23 artipacked-med، 3 excessive-perms-med، 2 cache-poisoning-**high**، 2 dangerous-triggers-**high**، 1 adhoc-low، 1 trusted-publishing-info) | — |
| اصلاحات مکانیکی | 23 checkout بدون `persist-credentials: false` → همه ۲۳ (دو فرم dash/name) فیکس شد؛ هیچ جابی push نمی‌کند (بررسی شد: ۰ `git push`) | f8ba4f43-مشابه در همین کامیت |
| permissions | securitycodescan.yml: بلوک سطح-فایل `contents: read` + جابِ SCS فقط `security-events: write` | همان کامیت |
| پیکربندیِ accept مستند | 5 ignored (2×cache-poisoning + 2×dangerous-triggers + 1×trusted-publishing) با توجیه در `.github/zizmor.yml` — لِینِ release مالکی، وورک‌فلوهای Notion فقط read-only با env-passthrough | `.github/zizmor.yml` |
| **نتیجه** | **No findings to report (5 ignored, 56 suppressed) — exit 0** | اجرای محلی zizmor 1.33.1 |

## ۳) gitleaks 8.30.1 — اسکن تاریخچه + baseline
- اسکن کامل تاریخچه (۴,۳۳۵ کامیت، ~۱۴۶MB): **۳۷ یافته** — طبقه‌بندیِ همه (بدون چاپِ مقدار رمز): فیکسچرِ تستِ JWT (`a02/p11/n15-test-*`، `*-probe-secret`)، نمونه‌های ساختگی JWT در نتایج بارِ W18 و هارنسِ IDOR (اثباتِ `alg:none`)، **SHAهای ۴۰-hex مستندات Chat8** که الگوی generic-api-key را خوردند، و `$${ELASTIC_PASSWORD}` compose-escape. **هیچ سکرت واقعی — نیازی به توقف/گزارش فوری مالک نیست** (شرط تسک).
- **baseline** (`--redact`): `.gitleaks-baseline.json` (۶۳KB؛ fingerprint-match → بدون افشای مقدار). اجرای بعدی با baseline = **no leaks found، exit 0**؛ هر یافتهٔ تازه = قرمزِ گیت.
- گیتِ CI: `.github/workflows/ci-hardening.yml` — دو جاب: gitleaks (نصب checksum-verify-شده + اسکن با baseline) و zizmor (پین‌شده + `--strict-collection`). هر دو با `persist-credentials: false` و least-privilege.

## ۴) انطباقِ تسک
- تغییرِ کد محصول: **هیچ** (فقط .github/**). ← اگر یافتهٔ سکرتِ واقعی بود: توقف و گزارش فوری (اتفاق نیفتاد؛ مدرک = طبقه‌بندی بالا).
- لایه‌های موجود دست نخورد: `tests/secret-scan.js` 13/13 همچنان سبز؛ gitleaks = لایهٔ دوم مستقل (تاریخچه‌محور).
- گیت‌های repo (docs-consistency، parity، secret-scan، lint) و strict gate = سبز روی همین HEAD.
