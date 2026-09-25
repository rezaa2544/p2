# گزارش مأموریت Arena 9 — A-38: ممیزی Verification Registry

**تاریخ:** ۱۴۰۵/۰۷/۰۳ (2026-09-25) · **شاخه:** `arena9/a38-verification-registry-20260925` (مستقل، از `main@66928be`)
**کامیت:** `f796b0d` · **Patch:** `arena_iqa_evidence/a38/0001-…patch`
**سطح شواهد:** E3 (اجرای واقعی؛ Node v22.14.0؛ سه ریست سندباکس حین مأموریت ثبت شد)
**قواعد رعایت‌شده:** هیچ evidence تاریخی با تغییر SHA معتبر نشد · registry برای green شدن دستکاری نشد · CERTIFIED در policy ممنوع و با گیت تحمیل شد.

---

## ۰) یافته بنیادین

`docs/verification/VERIFICATION_REGISTRY.json` **در هیچ کجای repo وجود نداشت** (جستجوی کامل نام/محتوا؛ تنها `BUNDLE_REGISTRY.md` برای باندل‌ها موجود است). شواهد de-facto در markdownهای تاریخی پراکنده‌اند و machine-verifiable نیستند. طبق مأموریت («اگر ساختار registry defect دارد، fix کن و regression اضافه کن»)، ساختار ایجاد شد — **بدون سبز کردن حتی یک قلم؛** هر status مستقیماً از اجرای واقعی یا از سند تاریخی مشتق شده است.

## ۱) Stale Evidence List — تاریخی، برای HEAD فعلی NOT VERIFIED

| ID | Evidence | SHA ثبت‌شده | تاریخ | حکم |
|---|---|---|---|---|
| VR-201 | دروازه انتشار کامل (`RELEASE_GATE_EVIDENCE.md`, CI 68/180) | `da13943` — در clone فعلی resolvable نیست | 2026-09-09 | STALE / NOT VERIFIED برای 66928be |
| VR-202 | PG_HYDRATE روی main (HANDOFF) | `0a208f8` — resolvable نیست | 2026-09-13 | STALE / NOT VERIFIED |
| VR-203 | راستی‌آزمایی P0-4 با PG 17.11 زنده | `1a73c52` — resolvable نیست | 2026-09-13 | STALE / NOT VERIFIED |
| VR-204 | Strict Verification چت ۲ | **UNRECORDED** (سند SHA ندارد) | 2026-09-21 | STALE + DEF-A38-03 |
| VR-205 | Exit-Gate فاز ۸.۲ + ماتریس DR-01 | **UNRECORDED** | 2026-09-22 | STALE + DEF-A38-03 |

## ۲) Missing Evidence — برای HEAD فعلی هیچ evidence وجود ندارد ⇒ NOT VERIFIED / BLOCKED

| ID | الزام | وضعیت | دلیل انسداد |
|---|---|---|---|
| VR-101 | CI Actions (build + Security Program ۶ job) | **BLOCKED** | بیلینگ Actions (RISK-O-007) + بدون credential |
| VR-102 | سوئیت‌های PostgreSQL زنده | **BLOCKED** | بدون PG؛ ریست‌های مکرر سندباکس نصب را پاک می‌کنند |
| VR-103 | مانور failover ردیس/سنتینل | **BLOCKED** | بدون Redis |
| VR-104 | DAST زنده / پنتست | **BLOCKED** | نیازمند استقرار و مجوز کارفرما |
| VR-105 | بار k6 مقیاس پایلوت | **BLOCKED** | زیرساخت خارج از مخزن |
| VR-106 | برابری ریموت push/ls-remote | **BLOCKED** | بدون credential (طبق دستور: push فقط با اعلام شما) |
| VR-301 | اصلاحات Arena 9 (`5f0af4e`) | **NOT_VERIFIED** | شاخه push نشده؛ artifact خارج از repo |
| VR-302 | باتری IQA ۲۶۳/۲۶۳ (`871ff05`) | **NOT_VERIFIED** | شاخه push نشده؛ باتری روی main موجود نیست |

## ۳) Invalid Evidence — نقص‌های ساختاری کشف‌شده (DEF-A38-*)

| ID | نقص | اقدام |
|---|---|---|
| DEF-A38-01 | **خود registry غایب بود** — هیچ سازوکار machine-readable برای اتصال requirement↔SHA↔exit↔artifact | ایجاد registry نسخه 1.0.0 + گیت ۱۴۳سنجه‌ای |
| DEF-A38-02 | `index.html` کامیت‌شده با خروجی `build.js` **بیت‌به‌بیت یکسان نیست**: اجرای اول `tests/run.js` از درخت تمیز = 34/35 (exit=1)، پس از self-heal = 35/35. روی baseline بازتولید قطعی شد | VR-001 با exit=1 و status=`DEFECT_OPEN` ثبت شد — **سبز نشد**؛ هر دو اجرا در artifact |
| DEF-A38-03 | دو سند ممیزی (چت۲، فاز۸.۲/DR-01) **SHA دقیق evidence را ثبت نکرده‌اند** | در registry با `UNRECORDED` و status=STALE ثبت؛ الگوی ممنوع از این پس با schema اجباری |
| DEF-A38-04 | قاعده `*.log` در `.gitignore` فایل‌های evidence را **بی‌صدا از commit حذف می‌کرد** (حین همین مأموریت کشف شد: validator سبز بود چون فقط دیسک را می‌دید) | استثنای `!docs/verification/evidence/**` + سنجه جدید «artifact باید در git track شده باشد» — قبل از fix قرمز (3❌)، بعد سبز |
| DEF-A38-05 | خطای capture در تولید evidence خودم: `EXIT=$?` بعد از pipe، exit فرمانِ tail را می‌گرفت نه node | evidence نامعتبر دور ریخته و با capture مستقیم `$?` بازتولید شد؛ در header ساختار `EXIT_CODE` اجباری شد |

## ۴) Current Valid Evidence — اجراشده در همین مأموریت روی درخت محصول `66928be`

| ID | فرمان | exit | نتیجه | artifact (در repo) | status |
|---|---|---|---|---|---|
| VR-002 | `node --expose-gc … tests/smoke.js` | **0** | 547/547 | `docs/verification/evidence/66928be/smoke.log` | ✅ VERIFIED_E3 |
| VR-003 | `node tests/semantic-layer/runner.js` | **0** | 33/33 | `…/semantic-layer.log` | ✅ VERIFIED_E3 |
| VR-004 | `node tests/api/runner.js` | **0** | 30/30 | `…/api-runner.log` | ✅ VERIFIED_E3 |
| VR-001 | `node tests/run.js` | **1** (اجرای اول) | 34/35 → self-heal → 35/35 | `…/run-js.log` (هر دو اجرا) | ⛔ DEFECT_OPEN (DEF-A38-02) |

هر artifact دارای header اجباری `COMMAND / HEAD / DATE / RUNTIME / EXIT_CODE` و timestamp واقعی اجرا (07:57–07:59Z امروز) است. فیلدهای ۹گانه هر قلم (requirement/head/command/exit/artifact/reviewer/timestamp/runtime/limitation) تکمیل؛ reviewer انسانی = PENDING (صادقانه ثبت شده).

**گیت regression:** `tests/verification-registry.test.js` — ۱۴۳ سنجه:
- VERIFIED فقط با exit=0 + artifact موجود **و track شده در git** + SHA چهل‌کاراکتری resolvable + **عدم drift درخت محصول از SHA evidence تا HEAD** (تغییر product tree ⇒ گیت قرمز تا evidence بازتولید شود)
- اتصال artifact↔SHA: بازاعتبارسازی evidence تاریخی با تغییر SHA شکست می‌خورد
- **Mutation-tested (No Fake Green):** ۳ سناریوی تقلب (SHA-swap روی STALE / VERIFIED بدون artifact / VERIFIED با exit=1) هر سه exit=1 ✅

## ۵) Files Changed

```
.gitignore                                          | +2  (استثنای evidence)
docs/verification/VERIFICATION_REGISTRY.json        | +248 (جدید — ۱۷ قلم)
docs/verification/evidence/66928be/run-js.log       | +41 (جدید)
docs/verification/evidence/66928be/smoke.log        | +18 (جدید)
docs/verification/evidence/66928be/semantic-layer.log| +14 (جدید)
docs/verification/evidence/66928be/api-runner.log   | +12 (جدید)
tests/verification-registry.test.js                 | +131 (جدید — گیت ۱۴۳ سنجه)
۷ فایل، ‎+466 خط — بدون هیچ تغییری در درخت محصول (خود validator این را تحمیل می‌کند)
```

## ۶) Commit SHA

- **`f796b0d1364e49fcbdf44a55027551774720cf57`** روی شاخه `arena9/a38-verification-registry-20260925` (پایه: `main@66928be`، FF تمیز، مستقل از شاخه‌های Arena9/IQA قبلی)
- push نشده (بدون credential + طبق دستور شما)؛ patch: `arena_iqa_evidence/a38/`
- محدودیت ثبت‌شده: `git fetch origin` از سندباکس ممکن نیست؛ «آخرین main» = `66928be` محلی. اگر main ریموت جلوتر است، پس از دسترسی باید evidence روی HEAD جدید بازتولید شود — registry طبق طراحی این را خودکار قرمز می‌کند.

## توصیه به Tech Lead (خارج از scope، بدون اقدام)
۱) ورود `tests/verification-registry.test.js` به زنجیره CI (پس از رفع VR-101). ۲) ریشه‌یابی DEF-A38-02 (احتمالاً وابستگی خروجی build به runtime). ۳) پس از merge شاخه‌های IQA/Arena9، بازتولید evidence روی HEAD جدید — گیت drift این را اجبار می‌کند.
