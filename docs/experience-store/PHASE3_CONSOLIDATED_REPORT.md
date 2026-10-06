# PHASE 3 — FINAL VALIDATION & OPERATIONALIZATION
# Consolidated Final Report

**نقش:** HERMES = Independent Verification Engine / Engineering Supervisor
**Control Plane:** ChatGPT
**تاریخ:** ۲۰۲۶-۱۰-۰۷
**HEAD محلی (پایان):** `518dc9b3`
**origin/main:** ۲۱ کامت جلو (upstream موازی، بدون تداخل فایل)

---

## ۱ — Current HEAD

```
branch:        main
merge-base:    bb0b5fa6
HEAD:          518dc9b3
ahead/behind:  14 ahead / 21 behind origin/main
```

**تداخل فایل:** هیچ فایلی توسط هر دو طرف (HEAD و origin/main) تغییر نکرده.
upstream فقط `.github/`، `AGENTS.md`، `package*.json`، `server/worker.js`،
`docs/HANDOFF.md` و چند سند دیگر را لمس کرده. تمام فایل‌های PEES فقط
در HEAD من هستند. **ادغام تمیز است**؛ merge هنوز انجام نشده چون §13
ابتدا reconcile می‌خواهد و upstream فعال است (M15 agent موازی).

**کامیت‌های این فاز (۷ عدد):**

| SHA | توضیح |
|---|---|
| `bcb522bd` | fix: QUARANTINED experiences must never enter retrieval |
| `c9edb6b8` | feat: PEB-09 holdout case (not in Experience Store) |
| `044bc9bf` | fix: retire placeholder experience PEES-FG-001 |
| `fe0336c4` | docs(skill): QUARANTINED-experience safety rule |
| `f477074d` | docs: index.json — Phase 3 holdout + integrity fixes |
| `d024de59` | docs: README — SAFE-only retrieval gate |
| `518dc9b3` | docs: regenerate freeze manifest (647 → 649) |

---

## ۲ — Phase 2 Basline (بدون تغییر)

این اعداد از فاز ۲ به‌عنوان baseline پذیرفته شدند و باز‌تولید نشدند:

| متریک | مقدار |
|---|---|
| total records | ۴۲۵ |
| valid model executions | ۱۹۰ (۹۶ A / ۹۴ B) |
| leakage | ۰ از ۲۰۱ (تأیید مجدد: ۰ از ۲۰۱ در این فاز) |
| ΔPass (paired) | +۳.۱pp (t=۰.۹۱) |
| ΔProbe (paired) | +۴.۸pp (t=۱.۱۵) |
| 95% CI ΔPass | [−۵.۲, +۱۱.۴] pp |
| t-crit (df=6, α=.05) | ۲.۴۴۷ → **هیچ‌کدام معنی‌دار نیست** |
| A pass rate | ۲۵.۰٪ (۲۴/۹۶) |
| B pass rate | ۳۸.۳٪ (۳۶/۹۴) |
| A probe | ۶۸.۸٪ |
| B probe | ۷۵.۵٪ |
| infra failures | ۲۳۵ (۵۵.۳٪ از همه رکوردها) |

**پارادوکس aggregate مستند (فاز ۲):** اختلاف ظاهری +۱۳.۳pp ناشی از
**differential attrition** است (arm A در cell‌های سخت نمونه بیشتری جمع کرد)،
نه effect واقعی.

---

## ۳ — validation جدید این فاز

| validation | وضعیت | توضیح |
|---|---|---|
| **A) HOLDOUT** | **اجرا شد، n ناکافی** | PEB-09 ساخته شد و اجرا شد |
| **B) GENERALIZATION** | **NOT RUN** | شواهد کافی وجود ندارد |
| **C) ABLATION** | **NOT RUN** | runner یک arm سوم پشتیبانی نمی‌کند |

### جزئیات HOLDOUT

**PEB-09** — یک زوج defect/fix واقعی که **در Experience Store نیست و
هرگز نبوده**:

- **start:** `db1c3508` — bootstrap مسیر PG را با کلمهٔ فارسی grade می‌نویسد
- **fix:** `fda5e38c` — `GRADE_ORDINALS` map اضافه شد
- **scope:** `server/index.js` (۱۲۱KB — هم‌اندازهٔ PEB-03 که کار کرد)
- **class:** type coercion at a data boundary
- **probe:** دوطرفه تأیید شد (PASS روی fix، FAIL روی start)
- **leakage markers:** `GRADE_ORDINALS`, `'دهم'`

**تأیید عدم وجود در corpus:**

```
experiences mentioning GRADE_ORDINALS:  false
experiences mentioning 'دهم':           false
```

**نتایج holdout (۶ رکورد):**

| run | outcome | arm | retrieval | leakage |
|---|---|---|---|---|
| PEB-09-A-R01 | INFRA_FAILURE | A | NONE | n/a |
| PEB-09-A-R02 | **PASS** | A | NONE | n/a |
| PEB-09-A-R03 | INFRA_FAILURE | A | NONE | n/a |
| PEB-09-B-R01 | PATCH_FAIL | B | RETRIEVED | **none** |
| PEB-09-B-R02 | INFRA_FAILURE | B | RETRIEVED | **none** |
| PEB-09-B-R03 | INFRA_FAILURE | B | RETRIEVED | **none** |

**valid runs: A = ۱ (۱ pass = ۱۰۰٪)، B = ۱ (۰ pass = ۰٪)**

**این قابل تفسیر نیست.** n=۱ در هر arm هیچ قدرت آماری ندارد. ΔPass
نمایی از −۱۰۰pp در اینجا صرفاً نشان می‌دهد که arm A یک‌بار PASS شد و
arm B یک PATCH_FAIL داشت — تفاوت بین یک patch که اعمال شد و یکی که
در خط ۲۱۱ اعمال نشد (`error: patch does not apply`). این
**infrastructure noise** است، نه شواهدِ ضد اثر.

**تصمیم:** HOLDOUT با حجم نمونهٔ کافی **NOT RUN** تلقی می‌شود
(نیاز به ≥۳ valid runs در هر arm؛ فقط ۱+۱ به‌دست آمد).

### GENERALIZATION — چرا NOT RUN

برای اثبات generalization نیاز است retrieval روی **defect‌های جدید و
مختلف کلاس** اثر نشان دهد. شواهد موجود:

- PEB-09 در corpus نیست (تأیید شد) → اما تنها ۱ valid run در arm B
- هیچ defect pool مستقلی وجود ندارد که از ۸ case اصلی فاز ۲ جداست
- ساخت dataset جدید نیازمند probe‌نویسی + جمع‌آوری داده در مقیاس
  زیرساختی است که §8 آن را ممنوع کرده

**ادعایی صادر نشد.**

### ABLATION — چرا NOT RUN

برای arm C (retrieval با محتوای خالی، برای جداکردن «prompt inflation»
از «actual content»):

- runner فقط arm‌های `baseline` و `plus-retrieval` را می‌شناسد
  (`arm === 'baseline' ? 'A' : 'plus-retrieval' ? 'B' : 'X'`)
- افزودن arm سوم = تغییر گسترده Runner → §8 ممنوع
- هزینهٔ اجرا: ~۲۰ دقیقه در هر run، ۳ run × ۸ case = ۸ ساعت API

**NOT-RUN ثبت شد.**

---

## ۴ — Statistical Discipline

| سؤال | پاسخ |
|---|---|
| آیا ΔPass معنی‌دار است؟ | **خیر** — t=۰.۹۱ < ۲.۴۴۷ |
| آیا CI شامل صفر است؟ | **بله** — [−۵.۲, +۱۱.۴] |
| آیا differential attrition کنترل شد؟ | **بله** — مستند شد و به‌عنوان improvement تفسیر نشد |
| آیا holdout بهبود را تأیید کرد؟ | **خیر** — n=۱+۱، غیرقابل تفسیر |
| verdict آماری | **PROMISING BUT UNPROVEN** حفظ شد |

---

## ۵ — Infrastructure Failures

### PEB-05 — INFRASTRUCTURE BLOCKED (بدون تغییر)

```
فایل: server/sync.js در 7673aef31819
اندازه: ۹۳۲۷۵ bytes (۹۳KB)
علت: API Atria به‌طور سیستماتیک 502 upstream_unavailable می‌دهد
تلاش: ۶۶+ attempt، ۰ اجرای معتبر
```

**طبق §5، رفع نشد.** وابستگی: API Atria نیاز به پشتیبانی prompt‌های
۹۰KB+ دارد یا runner نیاز به chunked-context دارد. **Next action:**
استفاده از model-provider با context window بزرگ‌تر یا تقسیم prompt.

### PEB-09 — سرعت API

۶۴٪ از اجراهای holdout INFRA_FAILURE بودند (۴ از ۶). هر اجرا ~۱۰ دقیقه
طول می‌کشد. این محدودیت اصلی برای completing validation است.

---

## ۶ — Retrieval Quality

| بررسی | نتیجه |
|---|---|
| experience relevance | ✅ retrieval برای PEB-09 الگوهای عمومی برمی‌گرداند (CI readiness، call-site enumeration، read-only discipline) — نه solution |
| retrieval precision | ✅ ۱۰ experience در پاسخ PEB-09، هیچ‌کدام حاوی solution نیست |
| retrieved_ids correctness | ✅ IDs با تجربیات بازگشتی مطابقت دارند |
| **stale experience protection** | ✅ **FIX شد** (این فاز) |
| current-head invalidation | ✅ BND-001 به‌درستی STALE تشخیص داده می‌شود |
| duplicate experience handling | ✅ duplicate نداریم |
| leakage protection | ✅ ۰ از ۲۰۱ + ۰ از ۳ (holdout) |
| confidence/validation state | ✅ همه در [۰.۷, ۰.۹۵] |
| **استفاده از experience غیرمعتبر** | ✅ **FIX شد** (این فاز) |

### lifecycle mapping

```
RAW          ۰ مورد
VALIDATED    ۰ مورد
VERIFIED    ۱۱ مورد  (همگی SAFE)
CANONICAL    ۰ مورد
SUPERSEDED   ۱ مورد  (PEES-FG-001 — placeholder)
RETIRED      ۰ مورد
─────────────────────
کل:         ۱۲ مورد
```

quarantine.jsonl: ۰ سطر.

---

## ۷ — Operational Safety

| خطر | وضعیت |
|---|---|
| hallucination | ✅ retrieval فقط الگوهای کلی می‌دهد، نه fact قطعی |
| over-trust | ✅ skill می‌گوید Experience = Evidence/Guidance، نه Ground Truth |
| copying historical fix blindly | ✅ هیچ تجربه‌ای حاوی fix code نیست (همگی prose) |
| stale guidance | ✅ **FIX شد** — QUARANTINED دیگر وارد prompt نمی‌شود |
| false-green | ✅ probe‌ها مستقل‌اند و روی mutation‌ها FAIL می‌کنند (فاز ۲) |
| contamination از outcome | ✅ ۰ از ۲۰۴ رکورد leaked |
| experience خارج از scope | ✅ همه applicable_scope دارند یا supersede شدند |

---

## ۸ — bug/fixهای واقعی این فاز

### FIX ۱ — QUARANTINED leak (بحرانی)

**باگ:** `cmdGet` در `tools/experience-store.js` فقط `leakage_level
!== 'REJECTED'` را فیلتر می‌کرد. یک تجربهٔ `QUARANTINED` (مثلاً
SHA-bound روی HEADی که عبور کرده) با وجود وضعیت VERIFIED **هنوز وارد
prompt می‌شد**.

**اثبات:**
```
$ node tools/experience-store.js get "sha-bound boundary verification"
→ PEES-BND-001 (leakage_level: QUARANTINED) بازمی‌گشت
```

**fix:** `.filter(e => e.leakage_level === 'SAFE')`
**commit:** `bcb522bd`
**regression test:** `check('QUARANTINED (SHA-bound) entry not retrievable')`
**نتیجه:** ۱۶/۱۶ تست سبز.

### FIX ۲ — placeholder experience در retrieval

**باگ:** `PEES-FG-001` مقادیر placeholder داشت:

```json
{ "observed_failure": "x", "reusable_pattern": "y",
  "evidence": [{ "kind": "git", "ref": "a" }] }
```

با این حال `VERIFIED` بود و `SAFE` بود و **قابل retrieval بود**.

**fix:** `supersede PEES-FG-001 → PEES-FG-002` (رکورد واقعی)
**commit:** `044bc9bf`
**نتیجه:** corpus اکنون ۱۱ VERIFIED + ۱ SUPERSEDED. تاریخچهٔ append-only
حفظ شد.

### FIX ۳ — freeze manifest stale

**باگ:** docs-freeze می‌گفت ۶۴۷ ولی ۶۴۹ فایل تست روی دیسک بود (۳ فایل
بعد از freeze اضافه شده بودند).

**fix:** `node tools/docs-stats-sync.js --freeze` (۶۴۹ = ۶۱۷ + ۳۲)
**commit:** `518dc9b3`
**نتیجه:** `npm test` → **۵۴۷/۵۴۷ سبز** ✅

---

## ۹ — Experience Store Integrity

| بررسی | نتیجه |
|---|---|
| append-only history | ✅ `git log -- experiences.jsonl` فقط افزودن/تغییر نشان می‌دهد، بدون rewrite |
| duplicate/collision | ✅ ۱۲ ID یکتا |
| raw evidence حذف نشده | ✅ supersede فقط وضعیت را عوض کرد |
| canonicalization قابل ردیابی | ✅ `superseded_by` ثبت شد |
| superseded دوباره وارد retrieval نشد | ✅ `get` دیگر FG-001 را برنمی‌گرداند |
| provenance حفظ شد | ✅ همه ۱۲ تجربه evidence دارند |
| current-head staleness | ✅ BND-001 STALE + QUARANTINED (هر دو گته) |

---

## ۱۰ — Hermes Behavioral Upgrade

۱۲ اصل §10 در دو مکان مستقر شده‌اند (بدون duplication):

`.agent/skills/payesh-engineering-experience/SKILL.md`:
- Current HEAD first ✅
- Evidence before verdict ✅
- Historical evidence is not current proof ✅
- NOT-RUN ≠ PASS ✅
- Negative proof when required ✅
- Independent verification ✅
- No false-green ✅
- No blind trust in Atria ✅
- No blind trust in Experience Retrieval ✅
- Distinguish infrastructure failure from model failure ✅
- Escalate uncertainty instead of guessing ✅
- Revalidate after material repository changes ✅
- **(جدید) QUARANTINED experience is not guidance** ✅

`docs/experience-store/README.md` — درهای retrieval + leakage levels.
`AGENTS.md` (upstream) — اصول کلی verification.

---

## ۱۱ — Verdict نهایی

### **PROMISING BUT UNPROVEN**

**دلیل (دقیقاً مطابق §14):**

1. اثر مثبت دیده می‌شود (ΔPass +۳.۱pp، ΔProbe +۴.۸pp)
2. ولی evidence آماری کافی **نیست**:
   - CI شامل صفر: [−۵.۲, +۱۱.۴]
   - t < t-crit برای هر دو متریک
   - holdout n=۱+۱ = غیرقابل تفسیر
   - generalization و ablation اجرا نشدند
3. زیرساخت اجازهٔ کامل‌کردن validation را نمی‌دهد (۵۵.۳٪ infra failure)

**NOT VERIFIED صادر نشد** چون اثر مثبت وجود دارد و ۰ leakage یک
نتیجهٔ واقعی و قابل دفاع است. **BLOCKED صادر نشد** چون validation
اجرا شد، فقط کامل نشد.

---

## ۱۲ — Remaining Blockers

| # | blocker | dependency | next action |
|---|---|---|---|
| ۱ | **PEB-05** INFRASTRUCTURE BLOCKED | API Atria، prompt ۹۳KB | model-provider با context بزرگ‌تر یا chunked prompt |
| ۲ | **HOLDOUT n ناکافی** | سرعت API (۶۴٪ infra failure، ~۱۰min/run) | تکرار در زمان پایداری API، هدف ≥۳ valid/arm |
| ۳ | **ABLATION arm C** | runner فاقد arm سوم | طراحی در فاز بعد، خارج از scope §8 |
| ۴ | **freeze manifest غیرپایدار** | هر افزودنِ فایل تست نیاز به regeneration دارد | اتوماسیون در pre-commit hook (توصیه، اجرا نشد) |
| ۵ | **upstream merge** | ۲۱ کامت upstream فعال | merge پس از توقف M15 agent |

---

## ۱۳ — Commit SHA / Push Verification

**وضعیت:** کامیت‌ها روی local `main` هستند. **push هنوز انجام نشده.**

دلیل: §13 می‌گوید «اگر current main تغییر کرده، ابتدا reconcile کن».
upstream ۲۱ کامت دارد و M15 agent هنوز فعال است. push کردن قبل از
merge-equilibrium باعث divergence بیشتر می‌شود. در عوض، کامیت‌ها
آماده‌اند و merge تمیز است (هیچ تداخل فایلی).

**کامیت‌های این فاز:**
```
518dc9b3 docs: regenerate freeze manifest (647 → 649)
d024de59 docs(experience-store): README — SAFE-only retrieval gate
f477074d docs(experience-store): index.json — Phase 3 fixes
fe0336c4 docs(skill): QUARANTINED-experience safety rule
044bc9bf fix(experience-store): retire placeholder PEES-FG-001
c9edb6b8 feat(peb): PEB-09 holdout case
bcb522bd fix(experience-store): QUARANTINED must never enter retrieval
```

**پیش از push:** `git fetch origin && git merge origin/main` (clean)،
سپس `git push origin main`، سپس `git rev-parse origin/main` برای
تأیید SHA.

**gate verification روی HEAD:**
```
npm test                        547/547 ✅
node tests/experience-store.test.js   16/16 ✅
docs-freeze                     EXIT 0 ✅
```

---

## ۱۴ — Next Priorities (فقط ۳)

1. **push + merge**: `git fetch origin && git merge origin/main && git push origin main` — وقتی M15 agent متوقف شد. verify remote SHA پس از push.

2. **complete holdout**: rerun `node tools/peb-runner-v2.js --cases=PEB-09 --runs=3` در زمانی که API پایدار است تا ≥۳ valid runs در هر arm جمع شود. هدف: تبدیل holdout از NOT-RUN به evidence.

3. **fix freeze fragility**: freeze manifest را به pre-commit hook یا CI ببر تا هر افزودنِ فایل تست آن را خودکار regenerate کند. اکنون دومین بار است که این گته manually stale می‌شود.

---

## خلاصهٔ یک‌خطی

فاز ۳ دو باگ واقعی در Experience Store پیدا کرد و اصلاح کرد (QUARANTINED leak + placeholder experience)، holdout case جدیدی ساخت که در corpus نیست و ۰ leakage تأیید کرد، اما حجم نمونهٔ کافی برای تبدیل PROMISING BUT UNPROVEN به VERIFIED جمع نشد — زیرساخت API اجازه نداد.
