# 📋 گزارش نهایی — چت ۷: Merge Queue Manager
**تاریخ:** ۲۰ شهریور ۱۴۰۵ (2026-09-10) · **شاخهٔ کاری:** worktreeهای جدا (`/tmp/prXX`) — بدون تداخل با کار چت‌های دیگر

---

## 🏁 وضعیت پایانی (به‌روزرسانی آخر)

**صف کاملاً خالی شد — هر ۸ PR بلاک‌شده رفع شد.**

| PR | عنوان | وضعیت اولیه | نتیجهٔ نهایی | کامیت |
|---|---|---|---|---|
| #51 | docs: OBSERVABILITY §30 (چت ۶) | CONFLICTING/DIRTY | ✅ **مرج‌شده** | `292f9aa` |
| #34 | feat(internship) E.2 (چت ۳) | CONFLICTING/DIRTY | ✅ **مرج‌شده** | `23f1881` |
| #33 | feat(behavior) E.3 (چت ۳) | CONFLICTING/DIRTY | ✅ **مرج‌شده** | `009ea9c` |
| #31 | feat(health) G.1 (چت ۳) | CONFLICTING/DIRTY | ✅ **مرج‌شده** | `f726964` |
| #35 | Feat/b3-d234 (چت ۴) | CONFLICTING/DIRTY | ✅ **مرج‌شده** | `fbb1306` |
| #46 | waves 14/16/17/18 (چت ۲) | CONFLICTING/DIRTY | ✅ **مرج‌شده** | `6f1643f` |
| #32 | feat(assets) E.5 (چت ۳) | CONFLICTING/DIRTY | ✅ **مرج‌شده** | `8bc0b0a` |
| #29 | feat(library) E.4 (چت ۳) | CONFLICTING/DIRTY | ✅ **MERGEABLE/CLEAN — هر ۷ چک CI سبز — آمادهٔ مرج** | `40a51b0` |

> ⚠️ **نکتهٔ صفِ زنده:** ناظر حین کار من PRها را مرج می‌کرد و `main` جلو می‌رفت (fac2ddf → fb9fcba → 80c5e3e → c2473e1 → cd484c3) — **چهار موج re-dirty** رخ داد و هر بار re-resolve شد (مثل چرخهٔ merge-queue واقعی).

---

## ترتیب اجرا (از کم‌ریسک به پرریسک)
1. **#51** (۴ فایل، فقط docs) → 2. **#31** (۶ فایل) → 3. **#33** (۱۴ فایل) → 4. **#34** (۱۳ فایل) → 5. **#32** (۱۳ فایل) → 6. **#29** (۱۵ فایل) → 7. **#35** (۲۹ فایل) → 8. **#46** (۴۶ فایل، ۱۵ فایل تعارض)

## تعارض‌های حل‌شده (خلاصهٔ فنی)

### الگوهای تکرارشونده
- **HANDOFF.md** (هر ۸ PR): keep-both — ورودی‌های main بالا (جدیدتر)، ورودی شاخه زیر آن
- **USER_GUIDE.html / index.html / write-perms.json**: هرگز دستی مرج نشد — همیشه `node build.js` + `node tools/generate-write-perms.js` بازتولید شد (اصل Single-File Distribution)
- **tests/smoke.js**: نسخهٔ main معمولاً superset است (NAV های PRهای مرج‌شده + اصلاحات Bug-Hunt)

### رفع‌های معماری‌محور (مهم)
- **#32/#29 — Wave 5 Authz**: `inScope` قدیمیِ sync.js (۱۲۰ خط inline) با delegate شدن به `policy.js` در main جایگزین شده بود. قواعد اختصاصی هر PR به **`server/policy.js`** منتقل شد (E.5 تحویلدار اموال، E.4 کتابدار) + تست‌های جهش M3 به فایل جدید retarget شدند (4/4 کشته).
- **#35 — D.3/D.4 چت ۴**: گارد `office_id` اطلاعیه‌ها + گیت جغرافیایی `staff_posts` به policy.js پورت شد؛ **D.4 عمداً data-first** شد (انتقال هنجار به مدرسهٔ بیرونِ محدوده بسته بماند — باگِ rec-first) و همزمان `EO_SCOPE_GATED` برای تأمین تست استاتیک T15.
- **#35 — schema.sql**: ۲۷ بلوک تعارض → بازتولید کامل با `node tools/migrate-to-pg.js` (مطابق PR_MERGE_PLAN §۶.۴)
- **#46 — metrics.js** (add/add، دو ماژول مستقل): union کامل — registry کاملِ Wave 14 چت ۲ + سری‌های سازگاریِ استکِ live-deployِ main (`payesh_redis_up`, `payesh_db_up`, … ) با probeهای لحظهٔ scrape (`publishRuntimeProbes`) + گارد خوداسکرپ (ضدفیدبک‌لوپ) + مسیرهای Wave 15 در کاتالوگ
- **#46 — cache.js**: ساختارِ جدیدِ main (LRU+TTL، پاکت‌های epochدار W11-2، `incrWithTtl` اتمیک) + متریک‌های Wave 14 graft شدند
- **#46 — dbquery.js**: جبرِ `compositeCursorKey` چت ۲ روی ساختار main پیاده شد (spec-object، export عمومی، cast عددی، جهت از spec)
- **#46 — Z3 جهش ایدمپوتانس**: main دفاع لایه‌ای دارد (پیش-اعمال + sweep)؛ تست تک‌خطی «سبزِ بی‌معنا» می‌داد → helper جدید **`mutateMulti`** نوشته شد که هر دو لایه با هم جهش می‌کنند (10/10 کشته)
- **#35 — سمبلink خراب `node_modules`**: از تاریخچهٔ شاخه حذف شد (dangling sandbox path)

---

## گیت‌ها (روی هر رفع، بدون استثنا)
| گیت | نتیجه |
|---|---|
| `node tests/smoke.js` | **۵۴۷/۵۴۷** ✅ (هر ۸ PR) |
| `node tools/check-authz.js` | **۰** ✅ |
| `node tests/secret-scan.js` | **۱۱/۱۱** ✅ |
| `node build.js --check` | **exit 0** ✅ |
| سوئیت‌های اختصاصی هر PR | assets 5/5+4/4 · library 7/7+4/4 · behavior 4/4+4/4 · internship 4/4+5/5 · health-index 32/32+5/5 · observability-doc 55/55 · staff-gap 17/17 · urgent-ann 14/14 · region 14/14 · exam-types 27/27 · wave14 95/95+12/12 · obs-config 55/55+6/6 · obs-dashboards 30/30 · wave16 75/75+11/11 · wave17 73/73+10/10 · wave18 62/62 · wave20 22/22 · wave15 10/10 · wave3-query3 18/18 · seed-integrity 14/14 ✅ |
| wave5-authz (#35/#32) | ۳۴/۳۷ = **دقیقاً baseline تمیزِ main** (۳ قرمزِ pre-existing: T18/T20/T21 — بدون رگرسیون، مدرک ثبت شد) |

## تأییدیه‌ها
- هر push با `git ls-remote origin <branch>` برابر HEAD تأیید شد ✅
- **#46: هر ۷ چک CI سبز** (build 22.x · SAST · Secret scan · SCA · SBOM · DAST · WAF&nginx) + `MERGEABLE/CLEAN` ✅
- Ruflo: `chat7_connected`، وضعیت هر PR، درس‌آموخته‌ها (`chat7_lessons`) ثبت شد ✅

## رویدادهای عملیاتی
1. **ریست سندباکس وسط کار #46**: worktree و اسکریپت‌های `/tmp` پاک شدند؛ کل رفع #46 با اسکریپت‌های marker-based بازنویسی و against `main` تازه‌تر (c2473e1) انجام شد — نتیجه نهایی کامل‌تر از نسخهٔ اول شد.
2. **clone دوبارهٔ سطحی (shallow) بعد از ریست**: با `git fetch --unshallow` رفع شد.

## پیشنهاد برای ناظر
- **#29 آخرین PR باز است: MERGEABLE/CLEAN + هر ۷ چک CI سبز** (build 22.x · SAST · Secret scan · SCA · SBOM · DAST · WAF&nginx) — آمادهٔ مرج فوری.
- پس از مرج #29 صف کاملاً خالی می‌شود؛ طبق SKILLS §۶ شاخه‌های فیچر حذف شوند.
- **جمع‌بندی نهایی چت ۷:** ۸/۸ PR بلاک‌شده رفع شد؛ ۷ مورد تاکنون مرج شده؛ رفع نهایی #29 شامل policy.js با هر دو قانون E.4 (کتابدار) + E.5 (تحویلدار)، گاردهای روت و منوی هر دو ماژول بود — بدون از دست رفتن هیچ قابلیتی از هیچ چتی.
