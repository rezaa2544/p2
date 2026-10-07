# PAYESH — HERMES EXPERIENCE ENGINEERING UPGRADE
# PHASE 3 — FINAL VALIDATION & OPERATIONALIZATION
## گزارش نهایی — ۱۲ بخش

**تاریخ:** ۱۴۰۵/۰۷/۱۵ (۷ اکتبر ۲۰۲۶)
**HEAD:** `28cb7268` (pushed → `origin/main`)
**Verdict نهایی:** **PROMISING BUT UNPROVEN**

---

## ۱ — Current HEAD / remote HEAD

| | SHA |
|---|---|
| Local HEAD | `28cb7268d7dbb45e51d41897f45eb0cd7f05bf73` |
| origin/main | `28cb7268d7dbb45e51d41897f45eb0cd7f05bf73` |

**وضعیت:** کاملاً همگام. ۹ کامیت فاز ۳ روی remote:
`b71c5591` (supersede fix) → `5c993083` (hook test) → `41eb2797` (hook revert) → `6aab3bea` (runner v3) → `721bbec9` (PEB-10) → `e7cd27eb` (COUCOU key) → `e4455f4b` (timeout fix) → `58b1c481` (merge upstream) → `28cb7268` (freeze regenerate).

**نکتهٔ مهم:** merge `58b1c481` یک commit مستندات از upstream (`59f9c3fc`) را بدون تداخل ادغام کرد. هیچ force-push و هیچ merge خودسرانه‌ای انجام نشد.

---

## ۲ — تغییرات انجام‌شده (فاز ۳)

### ۲.۱ Corrections باگ واقعی (三项)

| Commit | باگ | اصلاح |
|---|---|---|
| `b71c5591` | `cmdSupersede` فقط `validation_status` را عوض می‌کرد ولی `leakage_level` SAFE باقی می‌ماند → placeholder PEES-FG-001 همچنان serve می‌شد | `supersede` اکنون `leakage_level` را به `SUPERSEDED_SAFE` تنزل می‌دهد → retrieval gate آن را مسدود می‌کند |
| (همان commit) | `cmdAudit` فقط SAFE می‌شمرد → safe=10 به‌جای ۱۱ | شمارندهٔ `superseded` جدا + assertion `safe+quarantined+rejected+superseded === total` در تست |
| (همان commit) | PEES-FG-001 placeholder با مقادیر `'x'`/`'y'` ولی VERIFIED+SAFE و retrievable | supersede به FG-002 |

### ۲.۲ Infrastructure

| Commit | تغییر |
|---|---|
| `6aab3bea` | `peb-runner-v3.js` — endpoint Anthropic `/v1/messages` (endpoint قدیمی OpenAI-format 401 مرده بود) + arm C (`ablation-irrelevant`) |
| `721bbec9` | PEB-10 (generalization): `tests/otp-ratelimit.js`، `79869632`→`d6a72724`، env-var `PAYESH_OTP_PEPPER` — کلاس کاملاً متفاوت |
| `e7cd27eb` | ترتیب fallback کلید: `COUCOU_API_KEY` اول |
| `e4455f4b` | timeout درخواست ۳۶۰s → ۱۵۰s (runners چندین بار ۵+ ساعت hang شدند) |
| `5c993083`/`41eb2797` | pre-commit hook برای freeze auto-regen (نصب‌شده در `.git/hooks/pre-commit`) |

### ۲.۳ Freeze / cross-platform

**یک اصلاح مهم بیرون از commit:** فایل‌های `docs/*.md` روی دیسک CRLF بودند (به‌خاطر `core.autocrlf=true` در Windows) ولی freeze manifest هش‌های LF ثبت کرده بود → gate ۱۳/۱۴ FAIL. قانون `*.md eol=lf` در `.gitattributes` وجود داشت ولی checkout قدیمی قبل از اعمال قانون، فایل‌ها را CRLF کرده بود. fix: `git ls-files -z docs/ | xargs -0 rm; git checkout -- docs/` → فایل‌ها با LF بازچک‌اوت شدند. این یک اصلاح working-tree است، نه تغییر repo.

---

## ۳ — PEB-09 HOLDOUT

**Case:** `db1c3508`→`fda5e38c` — `GRADE_ORDINALS` در `server/index.js` (۱۲۱KB). کلاس: type-coercion در مرز داده. **۰ overlap با Experience Store corpus.**

| Arm | records | valid | pass | rate |
|---|---|---|---|---|
| A (بدون retrieval) | ۳ | **۱** | ۱ | ۱۰۰٪ |
| B (با retrieval) | ۳ | **۱** | ۰ | ۰٪ |
| C (filler ablation) | ۳ | **۰** | ۰ | n/a |

**نتایج خام:**
- `PEB-09-A-R01` INFRA_FAILURE, `A-R02` PASS, `A-R03` INFRA_FAILURE
- `PEB-09-B-R01` **PATCH_FAIL** (مدل تولید کرد ولی patch اعمال نشد), `B-R02` INFRA_FAILURE, `B-R03` INFRA_FAILURE
- `PEB-09-C-R01/R02` INFRA_FAILURE, `C-R03` API_ERROR

**Collect/gather:** نتیجه A=100% / B=0٪ با n=1+1 معنایی ندارد. تفاوت A-B به‌اندازهٔ کافی بزرگ نیست که با ۱ sample قابل تفسیر باشد.

**Collect/gather:** هدف ≥۳ valid runs برای هر arm **نیاز به رسیدن ندارد**. PEB-09 = **NOT VALIDATED**.

---

## ۴ — Generalization (PEB-10)

**Case:** `79869632`→`d6a72724` — `PAYESH_OTP_PEPPER` در `tests/otp-ratelimit.js` (۱۹KB). کلاس: test-harness env-var config — **کلاس کاملاً متفاوت از هر case در corpus**. probe دوطرفه تأیید شد (PASS روی fixed / FAIL روی buggy).

| Arm | records | valid | pass | rate |
|---|---|---|---|---|
| A (بدون retrieval) | ۵ | **۵** | ۵ | ۱۰۰٪ |
| B (با retrieval) | ۶ | **۲** | ۲ | ۱۰۰٪ |
| C (filler ablation) | ۳ | **۲** | ۲ | ۱۰۰٪ |

**نتایج خام:**
- A: `R01` PASS, `R02` PASS, `R03` PASS, `R02` PASS (retry), `R03` PASS (retry) — ۵/۵
- B: `R01` INFRA_FAILURE, `R02` PASS, `R03` PASS, `R01` INFRA_FAILURE (retry), `R02` INFRA_FAILURE (retry), `R03` API_ERROR
- C: `R01` PASS, `R02` INFRA_FAILURE, `R03` PASS

**تحلیل:**
- A=100% (۵/۵), B=100% (۲/۲), C=100% (۲/۲)
- ** Arm A به هدف ≥۳ رسید ✓. Arm B و C نرسیدند ✗.**
- مدل روی همهٔ arms این case را حل کرد — generalization **امکان‌پذیر است** ولی evidence کافی نیست.

**Collect/gather:** generalization = **SIGNAL BUT INSUFFICIENT**. مدل توانایی حل کلاس جدید را دارد، اما تفاوت A/B/C با n=2 قابل اندازه‌گیری نیست.

---

## ۵ — Ablation (Arm C)

**Design:** arm C = retrieval با **filler content بدون engineering signal** — همان تورم اندازهٔ prompt arm B، ولی محتوای filler. هدف: جدا کردن «محتوا» از «padding».

| Case | A | B | C |
|---|---|---|---|
| PEB-09 | ۱۰۰٪ (n=1) | ۰٪ (n=1) | n/a (n=0) |
| PEB-10 | ۱۰۰٪ (n=5) | ۱۰۰٪ (n=2) | ۱۰۰٪ (n=2) |
| PEB-02 | (فاز ۲) | (فاز ۲) | runner exit 1 |

**نتایج واقعی:**
- PEB-10: A=B=C=100% → ablation **هیچ تمایزی نشان نمی‌دهد** (یا case خیلی آسان است، یا n خیلی کم است)
- PEB-09: C هیچ valid run ندارد → **no signal**

**Collect/gather:** Ablation = **NOT RUN / INSUFFICIENT DATA**. هیچ نتیجه‌ای از arm C قابل استخراج نیست.

---

## ۶ — PEB-05

**Case:** `7673aef31819`→`8dcb0576` — `userInvQueue` در `server/sync.js` (۹۳KB).

| Arm | records | valid | pass |
|---|---|---|---|
| A | ۳۱ | ۱ | ۰ |
| B | ۳۵ | **۰** | ۰ |
| C | ۰ | ۰ | ۰ |

**Root cause (فاز ۲):** `Cluster RPM rate limit exceeded` (HTTP 429). نه اندازهٔ فایل — PEB-03 با ۱۲۳KB کار کرد چون فقط ۱۲ attempt داشت؛ PEB-05 با ۶۶+ attempt RPM کلاستر را فرسود.

**فاز ۳ تلاش:** endpoint جدید `/v1/messages` با کلید COUCOU. نتیجه: **۶۶+ INFRA_FAILURE / EMPTY_REPLY / API_ERROR**. صفر valid run روی arm B.

**Collect/gather:** PEB-05 = **INFRASTRUCTURE BLOCKED**. dependency: provider با rate-limit جداگانه یا context window بزرگ‌تر. هیچ workaroundی این را حل نکرده است.

---

## ۷ — Leakage

| Check | Scope | نتیجه |
|---|---|---|
| فاز ۱ | ۸ probe | **۰** |
| فاز ۲ | ۲۱۳ رکورد | **۰** |
| فاز ۳ (PEB-09 + PEB-10) | ۲۳ رکورد | **۰** |
| Experience Store retrieval | ۸ query | **۰** |

**Leakage = 0 در تمام چک‌ها.** markers: `GRADE_ORDINALS`, `'دهم'`, `PAYESH_OTP_PEPPER`, `otp-ratelimit-shared-pepper` — هیچ‌کدام در prompt/retrieved_text/model_output/patch_text ظاهر نشدند.

---

## ۸ — Test Suites

| Suite | نتیجه |
|---|---|
| `npm test` | **۳۸/۳۸ موفق** ✅ |
| `tests/experience-store.test.js` | **۱۶ passed, 0 failed** ✅ |
| `tests/docs-freeze-marker.js` | **۱۴ موفق / ۰ ناموفق** ✅ |
| `strict-verification-gate` | EXIT 1 (۳۸ audit-completeness failure — **بیرون از scope**) |

**نکته:** experience-store suite شامل regression test جدید است: «QUARANTINED experience قابل retrieval نیست» و assertion audit-sum.

---

## ۹ — Freeze / Reproducibility

**وضعیت:** freeze gate **۱۴/۱۴ سبز** روی `28cb7268` (pushed).

**تاریخ شکنندگی freeze (۳ بار stale شد):**
1. بعد از commit تست جدید → pre-commit hook نصب شد
2. بعد از merge upstream → regeneration دستی
3. بعد از CRLF/LF mismatch → checkout با LF

**اصلاح:** pre-commit hook `.git/hooks/pre-commit` هنگام stage شدن `tests/*.js` فریز را regenerate + add می‌کند. تست‌شده: dummy file → freeze ۶۵۰→۶۵۱ → cleanup → ۶۵۰.

**Collect/gather:** hook فقط `tests/*.js` را trigger می‌کند. اگر `docs/*.md` تغییر کند، freeze stale می‌شود (مثل اتفاق امروز). این یک **collect/gather باقی می‌ماند**.

---

## ۱۰ — Remaining Blockers

| Blocker | وضعیت | dependency |
|---|---|---|
| PEB-05 arm B | ۰ valid run در ۶۶+ attempt | provider rate-limit / context window |
| PEB-09 ≥۳ valid/arm | ۱+۱+۰ | API instability روی ۱۲۱KB prompt |
| PEB-10 arm B/C ≥۳ | ۲+۲ | API INFRA_FAILURE ۶۰٪+ |
| Ablation arm C | no signal | n کافی |
| strict-verification-gate | EXIT 1 | ۳۸ audit-completeness (بیرون از scope) |
| freeze trigger برای docs | stale risk | hook فقط tests را پوشش می‌دهد |

**نرخ INFRA_FAILURE کلی:** از ۴۵۱ رکورد، تعداد زیادی INFRA_FAILURE/API_ERROR/EMPTY_REPLY وجود دارد. علت اصلی: timeoutهای درخواست + rate limit + endpoint instability. این **INFRA_FAILURE ≠ MODEL_FAILURE** است.

---

## ۱۱ — Final Verdict

# **PROMISING BUT UNPROVEN**

**دلایل (evidence-based):**

۱. **تأثیر retrieval اثبات نشده.** فاز ۲: ΔPass = +۳.۱pp، ۹۵٪ CI [−۵.۲, +۱۱.۴] — شامل صفر. فاز ۳: PEB-09 A=100%/B=0% (n=1+1، بی‌معنی)، PEB-10 A=B=C=100% (no discrimination).

۲. **بدون generalization evidence.** PEB-10 نشان می‌دهد مدل کلاس جدید را حل می‌کند، ولی همهٔ arms آن را حل کردند → retrieval هیچ	added valueای نشان نمی‌دهد.

۳. **بدون ablation signal.** arm C هیچ نتیجهٔ معتبری روی PEB-09 ندارد و روی PEB-10 با A/B برابر است.

۴. **PEB-05 مسدود.** ۶۶+ تلاش، صفر valid run روی arm B.

۵. **collect/gather differential attrition.** فاز ۲: ۲۵.۰٪→۳۸.۳٪ ظاهری ناشی از differential attrition است، نه effect.

۶. **Leakage = 0.** این یک خبر خوب است — هیچ کد راهنما یا hidden solution‌ای به مدل نشت نکرده.

۷. **اصلاحات واقعی انجام شد.** ۳ باگ واقعی (supersede، audit count، placeholder retrieval) + ۲ اصلاح infra (endpoint، timeout) + freeze fixing. همه روی HEAD.

**Collect/gather:** طبق قوانین مأموریت — هیچ PASS فرضی، هیچ completion بر اساس timeout، هیچ Verdict مثبت بدون evidence. verdict فقط در صورتی تغییر می‌کند که evidence کافی وجود داشته باشد.

---

## ۱۲ — آیا Hermes اکنون «ارتقا یافته و تأییدشده» است؟

## **خیر.**

**ارتقا یافته — بله:**
- Experience Store اجرا می‌شود و ۱۲ تجربهٔ SAFE را serve می‌کند
- retrieval gate درست کار می‌کند (QUARANTINED و SUPERSEDED مسدودند)
- leakage = ۰
- freeze gate ۱۴/۱۴
- npm test ۳۸/۳۸
- ۳ باگ واقعی اصلاح و commit شد
- همه روی remote `28cb7268`

**تأییدشده — خیر:**
- **هیچ اثباتی وجود ندارد که retrieval بهتر از no-retrieval است.**
- ΔPass = +۳.۱pp با CI شامل صفر
- PEB-09 تناقضی (A>B) ولی n=1+1
- PEB-10 تمایزی نشان نمی‌دهد
- Ablation no signal
- Generalization no signal
- PEB-05 مسدود

**هیچ‌یک از validationهای ضروری Phase ۳ با evidence کافی تکمیل نشد.** این یک اتمسفر «working infrastructure, unproven hypothesis» است.

---

## ضمیمه — آمار کامل data collection

**Total records:** ۴۵۱ (فاز ۲: ۴۲۵ + فاز ۳: ۲۶)

| Case | A rec/valid/pass | B rec/valid/pass | C rec/valid/pass |
|---|---|---|---|
| PEB-01 | ۲۰/۲۰/۲۰ | ۲۰/۲۰/۲۰ | — |
| PEB-02 | ۲۰/۲۰/۲۰ | ۲۰/۲۰/۲۰ | — |
| PEB-03 | ۱۲/۱۲/۱۲ | ۱۲/۱۲/۱۲ | — |
| PEB-04 | ۲۰/۱۴/۳ | ۲۰/۱۴/۹ | — |
| PEB-05 | ۳۱/۱/۰ | ۳۵/۰/۰ | ۰/۰/۰ |
| PEB-06 | ۲۰/۲۰/۲۰ | ۲۰/۲۰/۲۰ | — |
| PEB-07 | ۲۰/۰/۰ | ۹/۰/۰ | — |
| PEB-08 | ۳۸/۰/۰ | ۳۴/۰/۰ | — |
| PEB-09 | ۳/۱/۱ | ۳/۱/۰ | ۳/۰/۰ |
| PEB-10 | ۵/۵/۵ | ۶/۲/۲ | ۳/۲/۲ |

**فاز ۲ آمار نهایی (baseline):** ۱۹۰ valid (۹۶A/۹۴B)، pass A ۲۵.۰٪ → B ۳۸.۳٪، paired t-test df=6، t-crit 2.447 → **NO significance**.
