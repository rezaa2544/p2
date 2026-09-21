# PAYESH — MASTER EXECUTION SCHEDULE

**نسخه:** 1.0.0-MASTER-SCHEDULE
**تاریخ تدوین:** 2026-09-20  
**آخرین بازآرایی وضعیت:** 2026-09-21
**کامیت معرفی سند:** `8de13dbab596f09f3d9a3d1b92bae845f6b2f8aa`
**HEAD مبنای کد تأییدشده:** `4de6f57d4ec1a883cece5ba7ae7480be3bc768a8` (Code) / `5017e9a1a9e70ea5df869ecda763327cb7008da6` (Doc)
**مخزن:** `rezaa2544/p2` · شاخه `main`
**موتور رانتایم مجاز (B2):** `Node.js >= 22.0.0` (Canonical Runtime)
**پایگاه‌داده منبع حقیقت:** `PostgreSQL 17` (Authoritative SSoT)
**کش توزیع‌شده (B1):** `Redis 8` (Ephemeral / Cache-only با رفتار سخت Fail-Closed)
**مسیر بحرانی کانونی (B3):** ۱۴۰ اسپرینت سریالی (مگر اثبات تقویم موازی واقعی)
**بازه واقعی پروژه تا امروز:** `2026-09-01` → `2026-09-19` (۱۹ روز تقویمی)

---

## ۰. قرارداد صداقت این سند (Anti-Greenwashing Contract)

این سند از واژگان ممنوعهٔ زیر **در هیچ ردیف وضعیتی** استفاده نمی‌کند:
`100% complete` · `Production Ready` · `National Ready` · `Fully Verified` · `GO`

واژگان مجاز وضعیت (تنها همین‌ها):

| برچسب | معنی دقیق |
|---|---|
| `VERIFIED` | اجرای واقعی رانتایم (E3/E4) روی زیرساخت زنده، با کامیت + فرمان + خروجی ثبت‌شده |
| `NOT VERIFIED` | کد/سند وجود دارد اما اجرای اثبات‌کننده ثبت نشده است |
| `PARTIAL` | بخشی اثبات شده، بخشی نه — مرز دقیق در ستون شواهد نوشته شده |
| `BLOCKED` | مسدود به دلیل یافتهٔ باز یا وابستگی برآورده‌نشده |
| `PLANNED` | زمان‌بندی‌شده، هنوز شروع نشده |
| `RESEARCH` | فقط پژوهش؛ ورود به اجرای اصلی ممنوع تا عبور از Decision Gate |

سطوح شواهد (ارث‌بری از `docs/PHASE_8_ENTRY_AUDIT_REPORT.md` §۴ و اسکیل `evidence-integrity-and-commit-accounting`):

| سطح | تعریف | کاربرد مجاز |
|---|---|---|
| **E1** | فقط مستندات | قصد طراحی، رانبوک — **هرگز** ادعای PASS |
| **E2** | موک/شبیه‌سازی (jsdom، DB موک، authority موک) | استدلال منطقی، گارد رگرسیون — با برچسب `[MOCK]` |
| **E3** | رانتایم یکپارچهٔ واقعی (PostgreSQL 17.11 / Redis 8.0.2 زنده، پروسهٔ واقعی سرور) | ادعای رفتاری: fail-closed، ایزولاسیون، اتمیسیتی |
| **E4** | اثبات معادل تولید (E3 + تزریق آشوب/چندنمونه/مانور HA، بازتولیدپذیر مستقل) | حکم گیت فاز، صدور گواهی |

**قاعدهٔ طلایی این سند:** هیچ ردیفی بالاتر از سطح شواهدش برچسب نمی‌گیرد. چند فاز که در اسناد قبلی «۱۰۰٪ کامل» اعلام شده بودند، اینجا به دلیل ردِ صریح Red Team به `PARTIAL` یا `FAILED/REJECTED → REMEDIATED` تنزل یافته‌اند (بخش ۱).

---

## ۰.۱ وضعیت اجرایی به‌روزشده — 2026-09-21

> **Current HEAD:** `fbe178be7c99ddb6c068eee4f7b389a6b9e7aeab`  
> **Current roadmap ground truth:** `docs/ROADMAP_CURRENT_GROUND_TRUTH_2026-09-21.md`

| موضوع | وضعیت جاری | مبنای تصمیم |
|---|---|---|
| Phase 8.1 | VERIFIED | گزارش 8.1 + CI فعلی |
| Node.js CI روی HEAD | VERIFIED | Run #1093؛ تمام jobهای اصلی موفق |
| R1/R2/R21 | VERIFIED در CI | suiteهای اختصاصی در Node.js CI #1093 |
| Phase 8.2 | **PARTIAL — Evidence Reconciliation Required** | گزارش نهایی کوتاه VERIFIED است، اما Exit Evidence تفصیلی S3/S4 در اسناد موجود کامل ردیابی نشده |
| Phase 8.2 Exit | **NOT VERIFIED** | alert→on-call→runbook E4 و restore identity/RPO/RTO باید با run/artifact قابل بازتولید بسته شوند |
| Phase 8.3 | PLANNED / BLOCKED BY 8.2 EXIT | شروع اجرایی پس از عبور Gate 8.2 |
| Phase 8.4 | PLANNED | tenant hardening / R3 |
| Phase 8.5 | PLANNED | WAF enforce + independent certification |
| Phase 9.0 | PLANNED | Educational Wiring Gate |

**قاعدهٔ این به‌روزرسانی:** گزارش `PHASE_8_2_FINAL_VERIFICATION_REPORT.md` با برچسب VERIFIED حفظ می‌شود؛ اما تا وقتی Exit Criteria آن با Evidence اجرایی تفصیلی تطبیق داده نشده، Master Schedule اجازه نمی‌دهد 8.3 را شروع‌شده تلقی کنیم. این یک **Evidence Gate** است، نه بازگشت به کارهای قبلی.

### مأموریت بعدی
1. Reconcile همهٔ Evidenceهای S2/S3/S4.
2. در صورت فقدان Evidence، فقط همان drill/test را اجرا کن.
3. Gate Matrix نهایی 8.2 را با SHA + run ID ثبت کن.
4. سپس 8.3 را آزاد کن.

---


### ۰.۲ الحاق Red-Team Chat 2 — 2026-09-21

گزارش مستقل Adversarial/Red-Team دریافت‌شده از Chat 2 روی SHA تاریخی
`bc68b2b539bf5b59aa0108c0959af767ea57ce35` تهیه شده است. این گزارش به‌عنوان
evidence تاریخی/هدایت‌کننده ثبت می‌شود؛ برای تغییر status روی HEAD فعلی باید
findings اجرایی دوباره reproduce شوند.

**یافته‌های برنامه‌ای:**

- **RT2-01 — Codacy:** فایل workflow فعلی نیز `max-allowed-issues: 2147483647`
  دارد. این موضوع اکنون یک finding تأییدشده در source configuration است و باید
  با تصمیم صریح دربارهٔ security-gate semantics اصلاح/آزمون شود.
- **RT2-02 — Tenant Policy amplification:** ادعای ۲ query/request و اثر 20k RPS
  هنوز باید با instrumentation روی HEAD فعلی اثبات شود. تا measurement، عدد
  40k QPS یک extrapolation است، نه measured capacity.
- **RT2-03 — DR:** نبود E4 restore evidence برای PG/Redis همچنان blocker عملیاتی
  Phase 8.2 است تا restore identity + checksum + measured RPO/RTO ثبت شود.
- **RT2-04 — Observability:** نبود evidence کافی برای alert قطع telemetry باید با
  canonical Prometheus/Alertmanager config و outage drill بسته شود.
- **RT2-05 — Outbox:** at-least-once بودن به‌خودی‌خود defect نیست؛ باید consumer
  idempotency به‌صورت endpoint/consumer-specific inventory و test اثبات شود.
- **RT2-06 — Phase 8.3:** E4 staging topology و dataset واقعی 10M هنوز evidence
  اجرای load contract نیست؛ provisioning آن prerequisite اجرای E4 است.
- **RT2-07 — SHA boundary:** یافته‌های runtime گزارش Chat 2 باید روی current HEAD
  reproduce شوند؛ گزارش قدیمی نباید status جدید را به‌تنهایی تغییر دهد.

**اثر بر ترتیب اجرا:**

```text
Phase 8.2 Evidence Reconciliation
  ├─ M0-R: reproduce RT2-01..04 on current HEAD
  ├─ M1: canonical alert/on-call + telemetry outage drill
  ├─ M2: E4 PG/Redis restore + measured RPO/RTO
  ├─ M3: R6/R7 + cold-cache/revocation evidence
  └─ M4: Phase 8.2 Exit Gate
          ↓
Phase 8.3 provisioning
  ├─ E4 staging topology
  ├─ realistic 10M dataset
  ├─ instrumentation
  └─ only then empirical load/soak/chaos execution
```

**قید:** هیچ cache حافظه‌ای برای رفع Tenant Policy amplification بدون architecture
review، invalidation proof، cross-instance consistency و measurement وارد production
نمی‌شود.

## ۰.۳ الحاق Red-Team Chat 1 — 2026-09-21

گزارش Zero-Trust Regression Audit چت ۱ روی SHA تاریخی `6762d84b3c25f317ead7f2c3b95c5aa0b94e2951` دریافت شد. HEAD فعلی `fbe178be7c99ddb6c068eee4f7b389a6b9e7aeab` است؛ بنابراین این delta فقط به‌عنوان ورودی Evidence-Reconciliation ثبت می‌شود.

| ID | یافته | وضعیت برنامه‌ای | Sprint/Work Package |
|---|---|---|---|
| RT1-01 | async audit sync-FS regression candidate | **REPRODUCTION REQUIRED** | 8.2-M0-R |
| RT1-02 | API test runner authority-mode drift candidate | **REPRODUCTION REQUIRED** | 8.2-M0-R |
| RT1-03 | Wave 1 stale readCollection invariant candidate | **REPRODUCTION REQUIRED** | 8.2-M0-R |
| RT1-04 | Wave 23 handwritten migration runner candidate | **REPRODUCTION REQUIRED** | 8.2-M0-R |
| RT1-05 | static fake-green / secret-scan counts | **RECHECK CURRENT HEAD** | 8.2-M0-R |
| RT1-06 | S3/S4 pending claim | **RECONCILED WITH CURRENT ROADMAP** | 8.2 Exit |

### 8.2-M0-R execution contract

```
Current HEAD fbe178be
  ↓
Reproduce RT1-01..04
  ↓
Re-run static hygiene
  ↓
Reconcile with CI #1093 + existing artifacts
  ↓
Remediate only reproduced findings
  ↓
S3 alert/on-call evidence
  ↓
S4 PG/Redis restore + measured RPO/RTO
  ↓
Gate G6 / Phase 8.2 Exit
  ↓
Phase 8.3 provisioning + E4 scale evidence
```

**Evidence rule:** Chat 1's historical SHA cannot change current status by itself. Any finding that reproduces on `fbe178be` gets a concrete remediation task, test, SHA, and gate entry.

## ۱. HISTORICAL EXECUTION TIMELINE — بازسازی تاریخ واقعی پروژه از Git

روش استخراج: `git log --reverse --format="%h %ad %s" --date=short`، `git show <sha> --stat`، و تطبیق هر ادعای سند با کامیت واقعی. هیچ تاریخی حدس زده نشده؛ هر ردیف با SHA واقعی موجود در تاریخچه لنگر دارد. **مدت تاریخی فقط جایی نوشته شده که از Git قابل استخراج بود.**

### ۱.۱ دورهٔ بنیان‌گذاری (Pre-Phase / Client-Era)

| Phase | عنوان | Commit واقعی | تاریخ Commit | وضعیت واقعی | شواهد | نتیجه |
|---|---|---|---|---|---|---|
| P0 | ساختار ماژولار از نسخهٔ تک‌فایلی | `32da05e3` | 2026-09-01 | COMPLETED & VERIFIED | اولین کامیت مخزن؛ ساختار `src/js/` | پایهٔ کلاینت تثبیت شد |
| P0.1 | فیلد «نوع مدرسه» با پیامد رفتاری | `c030f207` | 2026-09-09 | COMPLETED & VERIFIED | `docs/SCHOOL_TYPE_GUIDE`؛ E1+E2 | قفلِ تصمیم معماری فاز ۰ |
| P0.2 | هم‌زمانی دو سال تحصیلی | `83e16069` | 2026-09-09 | COMPLETED & VERIFIED | `docs/ACADEMIC_YEARS_GUIDE.md` + تست | — |
| P0.3 | جداسازی امتحان نهایی کشوری از داخلی | `86151a33` | 2026-09-09 | COMPLETED & VERIFIED | `docs/` + roadmap + handoff | — |
| P-Auth | سرور مرحلهٔ ۱: تلفن+کد پیامکی+کد ملی، JWT سخت، sync، IDOR 404 | `e546e0e7` | 2026-09-06 | COMPLETED & VERIFIED | `tests/server1.js` ۳۰/۳۰ | تولد `server/index.js` |

### ۱.۲ دورهٔ Waves (زیرساخت ملی — Wave -1 تا Wave 24)

منبع تطبیقی: `docs/NATIONAL_ROADMAP_PROGRESS.md` (جدول Owner/Risk/Dependency/Evidence) + تأیید Git.

| Wave | عنوان | Commit لنگر | تاریخ | وضعیت واقعی | شواهد | نتیجه |
|---|---|---|---|---|---|---|
| -1 | Architecture Discovery | — (سندی) | 2026-09-08 | COMPLETED & VERIFIED | `THREAT_MODEL.md` + `BOTTLENECK_MAP.md` | پیش‌نیاز همه Waves |
| 0 | Baseline و Freeze | tag `national-baseline-start` | 2026-09-08 | COMPLETED & VERIFIED | `NATIONAL_BASELINE{,_PART2..4}.md` | Part 4 بازسازی شد (کامیت اولیه هرگز push نشده بود) |
| 1 | **PostgreSQL Source of Truth [P0]** | `50a81619` … PR #48/#47 | 2026-09-09 | COMPLETED & VERIFIED | `wave1-multi-instance` ۳۳/۳۳؛ `wave1-gate` ۳۵/۳۵؛ reads ۱۸/۱۸؛ writes ۱۵/۱۵ | بوت PG-authoritative + قفل fail-closed |
| 2 | Database Engineering | `59503727` | 2026-09-09 | COMPLETED & VERIFIED | `migrations/001–003`؛ `tests/db-engineering.js` | ساختار versioned |
| 3 | Query و Performance [P0] | `f2f0ba1` (PR #96) | 2026-09-12 | **PARTIAL** | `wave3-parity` ۲۰/۲۰ روی PG زنده با ~101k کاربر | باز: tenancy `school_id IS NULL`؛ `CONCURRENTLY` در تولید |
| 4 | Sync / A01 | `e5c9b27` (PR #71) | 2026-09-11 | **PARTIAL** | `delta-phase4` ۲۳/۲۳ + جهش ۲۰/۲۰ | اجرای ملی باز |
| 5 | **Authorization و Tenant Isolation [P0]** | `9c1381c6`…`d5230b7` | 2026-09-10 | COMPLETED & VERIFIED | `wave5-authz` ۳۷/۳۷؛ هم‌ارزی ۹۳٬۰۲۴/۰؛ smoke ۵۴۷/۵۴۷ | موتور یکتای `server/policy.js` |
| 6 | Redis و Distributed State [P0] | `83ad521` (PR #97) | 2026-09-12 | **PARTIAL** | `wave6-11-redis-live` ۱۶/۱۶ روی Redis 7.4.2 واقعی | باز: استقرار Redis مدیریت‌شده |
| 7 | Offline-first | — (PR #55 خانواده) | 2026-09-11 | **PARTIAL** | `wave7-offline-queue` ۷/۷ | باز: مانور قطعی طولانی e2e |
| 8 | Async Architecture | — | — | **PLANNED** | در انتظار شروع (روadmap صریحاً ⏳) | به NPF-T منتقل شد (بخش ۹) |
| 9 | Application Performance | `7ee5237` (PR #89) | 2026-09-12 | **PARTIAL** | `wave9-performance` ۳۹/۳۹؛ بلاک بکاپ ۴۶ms→۰.۶ms | باز: ایندکس مسیرهای O(n) |
| 10 | Database Scale | `973e6995` + مهاجرت ۰۱۲ | 2026-09-12 | **PARTIAL** | پارتیشن‌بندی ۶۲/۶۲؛ مانور ۲۵M سطر ۱۹.۶ دقیقه؛ swap ۰.۱۱۵s | باز: اجرا در تولید ۵۰M+/۲۸۸M (برون‌یابی مستند) |
| 11 | Cache | `83ad521` | 2026-09-12 | **PARTIAL** | `wave11-cache` ۳۵/۳۵ + C1..C5 روی Redis واقعی | باز: بنچمارک hit-rate بار واقعی |
| 12 | Network / Edge | `463233c` (PR #43) | 2026-09-10 | COMPLETED & VERIFIED | `wave12` ۲۴/۲۴ + جهش ۵/۵ | باقی: پچ CodeQL با توکن workflow |
| 13 | Security Program | — | 2026-09-11 | **PARTIAL** | ASVS ۴۱/۴۱؛ runtime ۲۳/۲۳؛ secret-scan ۱۱/۱۱ | باز: DAST زنده (منوط به استیجینگ) |
| 14 | Observability | PR #22 + PR #51 | 2026-09-10 | **PARTIAL** | metrics ۵۵/۵۵ config + ۳۰/۳۰ dashboards | باز: اجرای واقعی compose + تست webhook |
| 15 | Health / Deployment | PR #31 @ `cd484c3` | 2026-09-10 | **PARTIAL** | `/api/health-index` سوپرادمین‌فقط | باز: استقرار/دیپلوی واقعی |
| 16 | Disaster Recovery | PR #46 @ `cd484c3` | 2026-09-10 | **PARTIAL** | تست ۹۲/۹۲ + ۳۸/۳۸؛ `DR_RUNBOOK.md` با RPO/RTO | **باز: هیچ مانور restore/failover واقعی E4 اجرا نشده** |
| 17 | Testing Pyramid | PR #46، PR #77 | 2026-09-11 | **PARTIAL** | `a11y-keyboard` ۹۲/۹۲؛ سوئیت‌های موج ۳/۶/۷/۱۸/۱۹ | ابزار `docs-stats-sync.js` ضدِ کهنگی |
| 18 | National Load Testing | `cbebed95` | 2026-09-10 | **NOT VERIFIED** | `WAVE18_LOAD_TEST_PLAN.md` (E1) + harness | **اجرای واقعی ۱۰M dataset ثبت نشده** |
| 19 | Chaos / Failure Testing | `7520edb0` | 2026-09-09 | **PARTIAL** | `WAVE19_CHAOS_LIVE_REPORT.md` + `WAL_DRILL_REPORT.md` | اجرای چندنمونه واقعی باز |
| 20 | چهار/پنج Arena | `351bd10` | 2026-09-10 | COMPLETED & VERIFIED | `ARENA5_QA_RELIABILITY.md` | مالکیت‌ها تثبیت شد |
| 21 | مدارس روستایی و چندپایه | `d1a0bf2` (PR #85) | 2026-09-11 | COMPLETED & VERIFIED | `multi-grade` ۳۴/۳۴ + جهش ×۳؛ هر ۷ چک CI سبز | offline-first حفظ شد |
| 23 | گزارش‌های DB-native + کش کراندار | `f2f0ba1` خانواده | 2026-09-12 | COMPLETED & VERIFIED | `reports-bounded-cache` ۱۵/۱۵ + جهش ۱۰/۱۰؛ `bounded-delta-resume` ۱۴/۱۴ | دلتای بریده دیگر ساکت گم نمی‌شود |
| 24 | بهینه‌سازی عملکرد | `7ee5237` (PR #89) | 2026-09-12 | COMPLETED & VERIFIED | baseline ۴/۴؛ index.html ۲.۲۵M→۱.۶۵M؛ p95 درون‌پردازه ~۵ms | ⚠️ CI به دلیل انسداد بیلینگ اجرا نشد — گیت‌ها محلی |

> **قید صداقت (نقل از خودِ `NATIONAL_ROADMAP_PROGRESS.md`):** شش PR از بستهٔ هفت‌گانه پس از اسنپ‌شات محلی مرج شده‌اند و کدشان در برخی کلون‌ها نیست؛ آن وضعیت‌ها از ابلاغ تیمی گرفته شده، نه وارسی کد. این سند آن قید را حفظ می‌کند و آن ردیف‌ها را بالاتر از `PARTIAL` نمی‌برد مگر اینکه سوئیت زندهٔ متناظر در همین درخت اجرا شده باشد.

### ۱.۳ دورهٔ Educational Intelligence (فاز ۳ داخلی — P0-EI-01 … P0-EI-21)

| گام | عنوان | Commit واقعی | تاریخ | وضعیت واقعی | شواهد | نتیجه |
|---|---|---|---|---|---|---|
| P0-EI-01 | Educational Semantic Layer | `f0013a45` | 2026-09-17 | **PARTIAL** | ۷/۷ سوئیت + جهش؛ `tests/semantic-layer/` | **`server/analytics/semantic.js` توسط هیچ مسیر رانتایم require نمی‌شود** |
| P0-EI-01b | گسترش سمانتیک (progress/engagement/quality) | `54505c1f` | 2026-09-17 | **PARTIAL** | ۱۳/۱۳ سوئیت | همان قید عدم‌اتصال |
| P0-EI-02 | Longitudinal Student Timeline | `950d3272` | 2026-09-17 | **NOT VERIFIED** | کد + تست ماژولی | `student-timeline.js`: server-refs = **۰** |
| P0-EI-03 | Assessment Intelligence Engine | `94c51299` | 2026-09-17 | **NOT VERIFIED** | psychometric + Tukey + fairness | server-refs = **۰** |
| P0-EI-04 | Attendance Intelligence Engine | `9aff3c0d` | 2026-09-18 | **NOT VERIFIED** | chronic absence + temporal risk | server-refs = **۰** |
| P0-EI-05 | School Health Dashboard | `12b5a397` | 2026-09-18 | **NOT VERIFIED** | no-masking aggregation | server-refs = **۰** |
| P0-EI-09 | School Intelligence Command Center | `67d3c90c` | 2026-09-18 | **PARTIAL** | از طریق `server/routes/analytics.js` require می‌شود | مسیر HTTP دارد؛ اثبات رفتاری زنده ثبت نشده |
| P0-EI-10 | Regional Educational Intelligence Network | `5a430d48` | 2026-09-18 | **PARTIAL** | require شده در routes | همان |
| P0-EI-11 | Quality Governance Engine | `67036839` | 2026-09-18 | **PARTIAL** | require شده (۲ ارجاع) | همان |
| P0-EI-12…20 | Longitudinal monitoring، recommendation، feedback memory، governance dashboard، policy simulation، decision command، operational execution، outcome evaluation، platform integration | `1e3d3ed5`, `efc5d59f`, `9775b28f`, `37d26ed0`, `8bc77219`, `02968c4b`, `ab86bd11`, `658b8f1c` | 2026-09-18 | **PARTIAL** | همه در `routes/analytics.js` require شده‌اند | اتصال require اثبات شد؛ اثبات رفتاری E3 ثبت نشده |
| P0-EI-21 | Release Certification & Gate | `20fb66bd` / `e5489f42` (#319) | 2026-09-18 | **NOT VERIFIED** | `INTELLIGENCE_PHASE3_RELEASE_CERTIFICATE.md` (E1) | گواهی سندی است؛ اجرای E3 پشت آن ثبت نشده |

> **یافتهٔ زیروتراست F-EI-01 (جدید، این ممیزی):** هشت موتور آموزشی (`semantic`, `student-timeline`, `assessment-intelligence`, `attendance-intelligence`, `intervention-case-management`, `school-health-dashboard`, `parent-360`, `teacher-evidence`) در `server/analytics/` وجود دارند اما **هیچ فایل سروری آنها را require نمی‌کند** (اثبات: `grep -rl "analytics/<m>" server/ | grep -v self` → خالی). این دقیقاً همان الگوی «dead authority code» است که Red Team فاز ۶ آن را رد کرد. تا اتصال رانتایم، این گام‌ها حق برچسب COMPLETED ندارند → به **Phase 9.0 (Wiring Gate)** منتقل شدند.

### ۱.۴ دورهٔ Scale/Production (فاز ۴ و ۵ داخلی — P1-SC / P2-PL / P2-NI)

| گام | عنوان | Commit واقعی | تاریخ | وضعیت واقعی | شواهد | نتیجه |
|---|---|---|---|---|---|---|
| P1-SC-01 | Distributed Scalability Foundation | `d476f5c3` / `e621eeca` (#320) | 2026-09-18 | **PARTIAL** | کد + تست | بخشی بعداً در ۷.۶ بازنویسی شد |
| P1-SC-02 | Distributed Event Processing & Load Mgmt | `1058c8d9` / `93e86e93` (#321) | 2026-09-18 | **PARTIAL** | `event-processing-layer.js` | ⚠️ `processedIdempotencyKeys` = RAM authority (R1) |
| P1-SC-03 | Production Observability & Load Optimization | `fd221c95` / `42d70ea4` (#322) | 2026-09-18 | **PARTIAL** | کد رصد | مانور زنده ثبت نشده (R22) |
| P1-SC-04 | DR/Backup/HA Layer | `8ca205a9` / `36586445` (#323) | 2026-09-18 | **NOT VERIFIED** | کد + سند | **هیچ مانور failover واقعی (R10/R11)** |
| P1-SC-05 | Production Pilot Deployment & Traffic Mgmt | `63f57bb8` / `d6957066` (#324) | 2026-09-18 | **PARTIAL** | `provincial-pilot-scaling.js` | ⚠️ `_provincialStateStore` = RAM authority (R1) |
| P1-SC-06 | Security Hardening / Zero-Trust Runtime | `adc98c1f` / `f4656cf9` (#325) | 2026-09-18 | **PARTIAL** | WAF + attack detector | WAF پیش‌فرض report (R15 — تصمیم عمدی) |
| P1-SC-07 | Master Scalability Release Gate | `8b8bfdec` / `24e77bf4` (#327) | 2026-09-18 | **NOT VERIFIED** | گیت سندی | بار واقعی ملی اجرا نشد |
| P2-PL-01 | Multi-Region Federation & Pilot Provisioning | `b659e2ce` / `b4dd129b` (#328) | 2026-09-18 | **NOT VERIFIED** | `phase5-region-federation.js` | چندمنطقه‌ای واقعی مستقر نشده |
| P2-PL-02 | Provincial Pilot Activation & Traffic Scaling | `c85e4cc2` / `691fd31c` (#329) | 2026-09-18 | **NOT VERIFIED** | کد | — |
| P2-NI-01 | National Infrastructure Foundation | `cf0552c0` / `06245311` (#330) | 2026-09-18 | **NOT VERIFIED** | کد + سند | — |
| P2-NI-02 | National NOC & Controlled Scale Activation | `4db7dea4` / `cd1f1288` (#331) | 2026-09-18 | **FAILED / REJECTED → REMEDIATED** | Red Team B6: NOC اعداد هاردکد `p95=185`, `p99=620` برمی‌گرداند | رفع در `269161f6`/`6e1b5adb` — بازممیزی لازم |
| P2-NI-03 | Fabric Validation & Capacity Enforcement | `d2eab7e1` / `9cb1fb35` (#332) | 2026-09-18 | **PARTIAL** | `national-capacity-enforcement.js` | ⚠️ `activeReservations` = RAM authority (R1) |
| P2-NI-04 | National E2E Simulation & Capacity Proof | `21cbe8e7` / `7bca0068` (#333) | 2026-09-18 | **NOT VERIFIED** | شبیه‌سازی، نه بار واقعی | نام سند صراحتاً «simulation» است |
| P2-NI-05 | Production Truth Remediation | `b803d00b` / `0add81fb` (#334) | 2026-09-18 | **PARTIAL** | `PHASE5_PRODUCTION_TRUTH_REMEDIATION.md` | آغاز مسیر اصلاح |
| Phase 5 Steps 08–12 | «تکمیل ۱۰۰٪ و صدور گواهی» | `43446dff` | 2026-09-18 | **FAILED / REJECTED** | ادعای «۱۰۰٪» در همان روز توسط Red Team فاز ۶ بی‌اعتبار شد | سپس `9b056231` blockerها را بست |

### ۱.۵ دورهٔ Production Rollout و ردِ Red Team (فاز ۶)

| رویداد | Commit واقعی | تاریخ | وضعیت واقعی | شواهد |
|---|---|---|---|---|
| ارتقا به Stage 2 قناری منطقه‌ای | `dcc9bd29` | 2026-09-18 | **FAILED / REJECTED** | ادعای گیت عملیاتی |
| «۱۰۰٪ cutover ملی در ۳۱ استان» | `2a02e416` | 2026-09-18 | **FAILED / REJECTED** | `PHASE_6_FINAL_GO_LIVE_REPORT.md` مدعی «🟢 FULL 100% PRODUCTION GO-LIVE» شد |
| موتور قناری + سخت‌سازی + سوئیت‌ها | `323afdca` | 2026-09-18 | **FAILED / REJECTED** | — |
| تابلوی حاکمیتی «فاز ۶ ۱۰۰٪ کامل» | `002f87c4` | 2026-09-18 | **FAILED / REJECTED** | `PHASE_CONTROL_BOARD` |
| **حکم Red Team زیروتراست فاز ۶** | `046dafd4` | 2026-09-19 | 🔴 **NOT VERIFIED** | `PHASE6_FINAL_ZERO_TRUST_RED_TEAM_VERDICT.md` |

**متن حکم رد (نقل مستقیم از کامیت `046dafd4`):** «موتور قناری (`Phase6CanaryEngine`) به هیچ وجه به پایپ‌لاین درخواست‌های واقعی HTTP متصل نیست»؛ «وزن‌های ترافیک در `Map` حافظه فرار نگهداری شده و با هر Restart نابود می‌شوند»؛ «NOC داده‌های هاردکد جعلی برمی‌گرداند»؛ «ADR-012 به یک بولی `approved: true` تقلیل یافته که در برابر Replay کاملاً آسیب‌پذیر است»؛ «۲۰۱ مورد `process.exit(0)` و ۱۰۲ الگوی خروج خاموش شناسایی شد».

| مرحلهٔ ترمیم | Commit واقعی | تاریخ | وضعیت واقعی | چه چیزی واقعاً رفع شد |
|---|---|---|---|---|
| رفع B1–B10 (مسیریابی واقعی قناری، پایداری PG، گواهی رفتاری) | `a890c921` | 2026-09-18 | REMEDIATED | قناری به PG و مسیر واقعی متصل شد |
| گواهی رانتایم HTTP زنده + مرز تننت + حفاظت Replay | `ac117f0f` | 2026-09-19 | REMEDIATED | — |
| به‌روزرسانی حکم با ماتریس اثبات خصمانه | `4a5894d6` | 2026-09-19 | — | — |
| حکم «ریشه‌کنی علت» | `2fa96f4c` | 2026-09-19 | — | ۱۸۸+/۹۴− بازنویسی حکم |
| فاز ۶.۵ — Ed25519 حاکمیتی، هدرهای قناری SoT، دفتر Replay (RT-01..RT-10) | `269161f6` | 2026-09-19 | REMEDIATED | امضای نامتقارن جایگزین بولی شد |
| بازممیزی مستقل چت ۳ برای ۶.۵ | `1d3ca7d5` | 2026-09-19 | — | — |
| فاز ۶.۶ — production-truth-gate، ردیس fail-closed، `ops_kv` SoT، ۵ گیت دائمی | `6e1b5adb` | 2026-09-19 | REMEDIATED | پایهٔ گیت حقیقت تولید |

> **درس ثبت‌شدهٔ این دوره (نباید فراموش شود):** فاصلهٔ «ادعای ۱۰۰٪» تا «ردِ زیروتراست» **کمتر از ۲۴ ساعت** بود. علت ریشه‌ای: پذیرش سند به‌جای رانتایم. تمام گیت‌های بخش ۱۴ همین سند برای بستن این شکاف طراحی شده‌اند.

### ۱.۶ دورهٔ بازنشانی معماری (فاز ۷ → ۷.۶-R.7.2)

| Phase | عنوان | Commit واقعی | تاریخ | وضعیت واقعی | شواهد |
|---|---|---|---|---|---|
| 7 (ورودی) | ممیزی گیت انتشار و آمادگی | `a737b6d0` | 2026-09-18 | COMPLETED & VERIFIED | `PHASE_7_RELEASE_GATE_AND_READINESS_AUDIT.md` |
| 7 (ریشه) | **بازنشانی ریشه‌ای: PostgreSQL تنها مرجع** | `136151e6` | 2026-09-19 | COMPLETED & VERIFIED | تغییر بنیادین معماری |
| 7 (CI) | اسکیمای OCC/outbox باید ۰۱۵–۰۱۹ داشته باشد وگرنه سرور listen نمی‌کند | `e080adf5` | 2026-09-19 | COMPLETED & VERIFIED | گیت اجرایی |
| 7 (CI) | قطعی PG در truth-gate باید سرویس docker را متوقف کند | `a672c6e1` | 2026-09-19 | COMPLETED & VERIFIED | ضدِ fake-green |
| 7 | لایهٔ authority پستگرس و معماری حالت زیروتراست | `1a8e07b5` | 2026-09-19 | COMPLETED & VERIFIED | `server/infrastructure/authority/` |
| 7.2 | گواهی Red Team مستقل | `79d9a8a3` | 2026-09-19 | COMPLETED & VERIFIED | `PHASE_7_2_REDTEAM_CERTIFICATION_REPORT.md` |
| 7.3 | اعمال ناورداهای معماری + ترمیم پایهٔ مهاجرت | `427a4850` | 2026-09-19 | COMPLETED & VERIFIED | — |
| 7.4 | Red Team خصمانه | `a43ece40` | 2026-09-19 | COMPLETED & VERIFIED | `PHASE_7_4` گزارش |
| 7.5 | سخت‌سازی authority + هویت اپراتور قناری | `65ae548d`, `ad87dd11` | 2026-09-19 | COMPLETED & VERIFIED | — |
| 7.6 | جایگزینی مسیرهای رانتایم تولید با لایهٔ authority | `7db2b474`, `dfcfe71e` | 2026-09-19 | COMPLETED & VERIFIED | بازگواهی مستقل |
| 7.6-R.1…R.4 | مهاجرت ۰۲۰، ردیس strict fail-closed، دفتر آدیت سخت، کپسوله‌سازی کامل authority | `b49b6905`, `ab650d19`, `6c500768`, `46ac067b`, `37b42e95` | 2026-09-19 | COMPLETED & VERIFIED | `unified-production-verifier` متولد شد |
| 7.6-R.5 | اثبات رانتایم trace، تراکنش اتمی آدیت، verifier مبدأ RAM | `0fd5bfa7`, `2051a5e5`, `2edca2bd` | 2026-09-19 | COMPLETED & VERIFIED | — |
| 7.6-R.6 | سوئیت canary-atomic رانتایم تولید | `e579a4eb` | 2026-09-19 | COMPLETED & VERIFIED | — |
| 7.6-R.7 | مرز تننت برای همهٔ درخواست‌های غیرسوپرادمین | `a6d0906a` | 2026-09-19 | COMPLETED & VERIFIED | — |
| 7.6-R.7.2 | ایمنی دایرکتوری لاگر، گارد demo_code تولید، canary روی PG زنده | `0b53ec0f`, **`766be4b8`** | 2026-09-19 | COMPLETED & VERIFIED | **CODE_COMMIT مرجع فاز ۸** |
| — | اتحاد ۲۲ اسکیل مهندسی/AI | `4530d753` | 2026-09-19 | COMPLETED & VERIFIED | فقط `.claude/skills/` + `skills/` (۵۴ فایل، صفر کد) |

### ۱.۷ دورهٔ Zero-Trust Phase 8 (وضعیت فعلی)

| Phase | عنوان | Commit واقعی | تاریخ | وضعیت واقعی | شواهد | نتیجه |
|---|---|---|---|---|---|---|
| 8 (ورودی) | ممیزی ورودی زیروتراست مستقل | `0ed11601` | 2026-09-19 | COMPLETED & VERIFIED | `PHASE_8_ENTRY_AUDIT_REPORT.md`؛ truth-gate ۴۴/۴۴ بازتولید شد | **PHASE 8: READY** + ۲۵ یافته R1–R25 |
| — | الحاقات مقیاس ملی (ورودی تحقیقاتی) | `cc47f21b` | 2026-09-20 | RESEARCH | `NATIONAL_SCALE_FUTURE_UPGRADES_ADDENDUM.md` | ورودی رسمی ۸/۹ |
| **8.1** | **رفع R5/R15/R16/R20 + بستن شواهد** | **`2c443541`** (CODE) + **`477f44b3`** (DOC) | 2026-09-19 | **COMPLETED & VERIFIED** | باتری ۱۲۷/۱۲۷ روی PG 17.11 + Redis 8.0.2 زنده؛ truth-gate ۴۴/۴۴ VERIFIED؛ r5 ۱۳/۱۳؛ verifier ۱۴/۱۴ در هر دو شکل محیطی | `PHASE 8.1 STATUS: Architecture PASS, Security PASS, Evidence PASS, CI Enforcement PASS, Phase 8.2 Eligibility VERIFIED` |

**مدت تاریخی فاز ۸.۱ از Git:** کامیت‌ها `2c443541`→`477f44b3` هر دو در 2026-09-19 (کمتر از یک روز اجرای فشرده). برای فازهای دیگر که چند کامیت در یک روز دارند، **مدت تاریخی حدس زده نمی‌شود** — ستون Duration در بخش ۱۱ برای آنها `Actual (git-dated)` علامت خورده و بازهٔ تاریخ واقعی نوشته شده است.

---

## ۲. CURRENT STATE — وضعیت واقعی امروز (2026-09-21)

```text
HEAD                    : fbe178be7c99ddb6c068eee4f7b389a6b9e7aeab
آخرین CODE_COMMIT معتبر : fbe178be7c99ddb6c068eee4f7b389a6b9e7aeab  (main فعلی)
آخرین DOC_COMMIT معتبر  : 62f6097b4710c2bc5ca02bb663d44a1db18d99f8  (current roadmap reconciliation)
معماری داده             : PostgreSQL = SSoT (VERIFIED, E3) · Redis = cache/ephemeral (VERIFIED, E3)
گیت حقیقت تولید         : 44/44 VERIFIED روی PG 17.11 + Redis 8.0.2
باتری رگرسیون          : 127/127 (E3) — اکنون در CI اجباری شده (batteries A–D)
یافته‌های 🔴 باز        : صفر  (R5, R15, R16, R20 بسته شدند)
یافته‌های 🟠 باز        : R1, R2, R3, R4, R6, R10, R11, R21, R22  (۹ مورد)
یافته‌های 🟡 باز        : R7, R8, R9, R12, R13, R14, R17, R18, R19, R23, R24, R25  (۱۲ مورد)
یافتهٔ جدید این ممیزی   : F-EI-01 (هشت موتور آموزشی بدون اتصال رانتایم) 🟠
مسدودکنندهٔ عملیاتی     : اجرای اولین GitHub Actions پس از فاز 8.1 هنوز معاینه نشده (RISK-O-007 بیلینگ)
```

**آنچه واقعاً VERIFIED است (E3+):** SSoT پستگرس · ایزولاسیون تننت روی `/api/v1/*` · اتمیسیتی قناری · fail-closed ردیس و پستگرس · fail-fast بوت تولید (۷ شکل/۱۳ چک) · دفتر آدیت اتمی · حفاظت Replay با Ed25519 · باتری ۱۲۷تایی.

**آنچه ادعا شده ولی VERIFIED نیست:** بار ملی ۱۰M واقعی · مانور failover پستگرس/ردیس · soak چندنمونه · مانور alert→on-call · اتصال رانتایم هشت موتور آموزشی · دفتر مهاجرت ماشینی.

---

## ۳. FINDINGS REGISTER — هیچ یافته‌ای گم نمی‌شود

هر یافتهٔ Red Team / Zero Trust / Audit به Task قابل پیگیری با مالک فاز تبدیل شد. وضعیت‌ها: `FIXED` / `PARTIALLY_FIXED` / `OPEN` / `DEFERRED`.

### ۳.۱ یافته‌های موضوعی مورد تأکید مأموریت

| موضوع | شناسه | وضعیت | شواهد / مقصد |
|---|---|---|---|
| **RAM authority** (۵ ماژول کنترل‌پلن) | R1 | **OPEN** | `provincial-pilot-scaling._provincialStateStore`، `change-management.changeRegistry`، `national-capacity-enforcement.activeReservations`، `national-operations-center.activeIncidents`، `event-processing-layer.processedIdempotencyKeys` — بدون ابطال بین‌نمونه‌ای → **Phase 8.3 / C2** |
| **PostgreSQL Source of Truth** | Wave 1 + `136151e6` | **FIXED** | بوت PG-authoritative؛ truth-gate ۴۴/۴۴ (E3) |
| **dead authority code** | فاز ۷.۶-R.4 | **FIXED** | `46ac067b` کپسوله‌سازی کامل؛ verifier مبدأ RAM |
| **dead educational code** (جدید) | **F-EI-01** | **OPEN** | ۸ موتور `server/analytics/*` با server-refs=۰ → **Phase 9.0 Wiring Gate** |
| **canary runtime wiring** | B1 فاز ۶ | **FIXED** | `a890c921` + `ac117f0f`؛ canary-atomic-live ۱۰/۱۰ (E3) |
| **governance ledger** | ADR-012 / B10 | **FIXED** | `269161f6` Ed25519 + دفتر Replay (RT-01..RT-10) |
| **replay protection** | B7 فاز ۶ | **FIXED** | nonce + انقضا + امضای نامتقارن (E3) |
| **tenant isolation** | B8 / R3 | **PARTIALLY_FIXED** | اجبار روی `/api/v1/*` (VERIFIED)؛ مسیرهای legacy پراکنده → **Phase 8.4 / D1** |
| **Redis fail-closed** | فاز ۶.۶ / R5 | **FIXED** | `6e1b5adb` + فاز ۸.۱ fail-fast بوت؛ r5 ماتریس ۱۳/۱۳ |
| **PostgreSQL fail-closed** | فاز ۷ | **FIXED** | `e080adf5` (بدون ۰۱۵–۰۱۹ سرور listen نمی‌کند) |
| **migration collisions** | #82 | **FIXED** | `eba5e7f0` ری‌تارگت زنجیرهٔ ۰۰۹→۰۱۲ |
| **migration dependency failures** | فاز ۷.۳ | **FIXED** | `427a4850`؛ migration-sequence ۱۹/۱۹ (E3) |
| **outbox** | ۰۱۴ + wave8 | **PARTIALLY_FIXED** | `16bb2b2c` (outbox.mark پس از restart روی PG)؛ DLQ B4 — گسترش در NPF-T |
| **conflict persistence** | فاز ۳ P0 | **FIXED** | `5e69dc3e` conflict SSoT |
| **OCC** | ۰۱۳ | **FIXED** | `phase2-occ-multi` ۱۰/۱۰ (E3) |
| **TOCTOU** | فاز ۲ | **FIXED** | `1e2aa96d` ۱۰ blocker با اثبات رفتاری PG/Redis واقعی |
| **WAF** | R15 | **FIXED (تصمیم ثبت‌شده)** | پیش‌فرض report **عمدی** (P0 #6 / RISK-S-007)؛ هشدار بوت پرصدا افزوده شد؛ **enforce = الزام Phase 8.5** |
| **NOC live metrics** | B6 | **PARTIALLY_FIXED** | هاردکد حذف شد (`269161f6`/`6e1b5adb`)؛ بازممیزی مستقل NOC ثبت نشده → **Phase 8.2** |
| **fake-green tests** | B9 | **PARTIALLY_FIXED** | گیت‌های ضدِ fake-green افزوده شد (`a672c6e1`)؛ ۲۰۱ `process.exit(0)` کامل ممیزی نشده → **Phase 8.2 / B5 جدید** |
| **silent skips** | B9 | **PARTIALLY_FIXED** | همان بالا |
| **CI enforcement** | R20 | **FIXED** | باتری A–D در `.github/workflows/node.js.yml`؛ **اما اولین اجرای واقعی Actions هنوز معاینه نشده** |
| **audit durability** | فاز ۷.۶-R.2 | **FIXED** | دفتر آدیت سخت + تراکنش اتمی (E3) |
| **production boot hardening** | R5 | **FIXED** | ۷ شکل بوت، ۱۳ چک، fail-fast اثبات‌شده (E3) |
| **DR / restore verification** | R10, R11 | **OPEN** | کد+سند E1/E2؛ **هیچ مانور زندهٔ E4** → **Phase 8.2 / W21-07** |
| **multi-instance consistency** | R1, R12 | **OPEN** | soak چندنمونه ثبت نشده → **Phase 8.3 / C2** |

### ۳.۲ رجیستر کامل R1–R25 با مقصد فاز

| ID | شدت | عنوان کوتاه | وضعیت | مقصد |
|---|---|---|---|---|
| R1 | 🟠 | پنج کنترل‌پلن RAM-authoritative | OPEN | 8.3 / C2 |
| R2 | 🟠 | `requireDb()` سکوت می‌کند وقتی `DATABASE_URL` نیست | OPEN | 8.1+ / A6 → منتقل به 8.3 |
| R3 | 🟠 | گارد تننت فقط روی `/api/v1/*` | PARTIALLY_FIXED | 8.4 / D1 |
| R4 | 🟠 | پرچم‌های نامتقارن تولید (`PAYESH_ENV` vs `NODE_ENV`) | PARTIALLY_FIXED | 8.3 / A5 |
| R5 | 🔴 | زامبی‌سرور بدون `REDIS_URL` | **FIXED** (8.1) | — |
| R6 | 🟠 | ابطال نشست fail-open زیر قطعی ردیس | DEFERRED (تصمیم رسمی لازم) | 8.2 / B4 |
| R7 | 🟡 | backpressure سینک توصیه‌ای زیر قطعی ردیس | DEFERRED | 8.2 / B4 |
| R8 | 🟡 | پیش‌فرض جادویی استان `'07'` | OPEN | 8.4 / D2 |
| R9 | 🟡 | seed بازِ `tenant_policy` | OPEN | 8.4 / D3 |
| R10 | 🟠 | PG تک‌نمونه در همهٔ شواهد | OPEN | 8.2 / W21-07 |
| R11 | 🟠 | همان برای Redis | OPEN | 8.2 / W21-07 |
| R12 | 🟡 | مدل سرویس تک‌پروسه | OPEN | 8.3 |
| R13 | 🟡 | بوت سرد ۶۰–۱۲۰ ثانیه، بودجهٔ گیت ۶۶ ثانیه | OPEN | 8.3 / C3 |
| R14 | 🟡 | `routeRequestSoT` هر درخواست PG می‌زند | OPEN | 8.3 / C1 |
| R15 | 🔴 | WAF پیش‌فرض report | **FIXED** (تصمیم + هشدار) | enforce در 8.5 |
| R16 | 🟠 | باگ محیط‌وابستهٔ verifier | **FIXED** (8.1) | — |
| R17 | 🟡 | `engines >=20` در حالی که زنجیره Node ≥22 می‌خواهد | OPEN | 8.3 / A7 |
| R18 | 🟡 | `/api/public-report` بدون احراز هویت | OPEN | 8.4 / C4 |
| R19 | 🟡 | سقف نرخ ورود برای مسیر Excel | OPEN | 8.4 |
| R20 | 🔴 | باتری ۱۲۷تایی در CI نبود | **FIXED** (8.1) | معاینهٔ اولین اجرا |
| R21 | 🟠 | دفتر مهاجرت ماشینی وجود ندارد | OPEN (تأیید شد: `grep schema_migrations` = خالی) | 8.3 / A8 |
| R22 | 🟠 | رصد ساخته شده ولی مانور نشده | OPEN | 8.2 / B1–B3 |
| R23 | 🟡 | پراکندگی ۴۶۸ سند در `docs/` | OPEN (تأیید شد: ۴۶۸ فایل) | 8.4 / تمیزکاری |
| R24 | 🟡 | تک‌آرتیفکت ۱.۶MB `index.html` | OPEN | Phase 14 / CDN |
| R25 | 🟡 | انحراف دفترداری حاکمیتی | PARTIALLY_FIXED | قاعدهٔ «ممیز HEAD را خود استخراج کند» تثبیت شد |
| **F-EI-01** | 🟠 | **۸ موتور آموزشی بدون اتصال رانتایم** | **OPEN (جدید)** | **Phase 9.0 Wiring Gate** |
| **F-CI-01** | 🟡 | **اولین اجرای Actions پس از 8.1 معاینه نشده** | **OPEN (جدید)** | **Sprint 1** |

---

## ۴. MASTER EXECUTION DEPENDENCY GRAPH

ترتیب پیشنهادی مأموریت بررسی شد و **بر اساس شواهد مخزن در دو نقطه اصلاح شد** (توضیح زیر نمودار):

```text
                    ┌──────────────────────────────────────────┐
                    │  G0 Git Truth Gate (هر فاز، بدون استثنا) │
                    └────────────────────┬─────────────────────┘
                                         ↓
   [DONE] Infrastructure ─→ Security ─→ Data ─→ Identity ─→ Tenant Isolation ─→ Audit
      (Wave 0/2/12)      (Wave 5/13)  (Wave 1)  (phone-auth)   (7.6-R.7)      (7.6-R.2)
                                         ↓
                    ╔════════════════════════════════════════╗
                    ║  PHASE 8 — Zero-Trust Closure (جاری)   ║
                    ║  8.1 ✅ → 8.2 → 8.3 → 8.4 → 8.5        ║
                    ╚════════════════════┬═══════════════════╝
                                         ↓
              ┌──────────────────────────┴───────────────────────────┐
              ↓                                                       ↓
   ╔═══════════════════════════════╗                    ╔═══════════════════════════╗
   ║ NATIONAL PLATFORM FOUNDATION  ║  ←── cross-link ──→ ║  Phase 9.0 WIRING GATE    ║
   ║ TRACK (NPF-T) — موازی دائمی   ║                     ║  (بستن F-EI-01)           ║
   ╚═══════════════╤═══════════════╝                    ╚═════════════╤═════════════╝
                   │                                                   ↓
                   │                              Phase 9 — Educational Foundation
                   │                                 9.1 Assessment → 9.2 Consent
                   │                                 9.3 Portfolio  → 9.4 Parent
                   │                                                   ↓
                   │                              Phase 10 — Guidance & Wellbeing
                   │                                 (نیازمند 8.4 Tenant + Audit)
                   │                                                   ↓
                   ├──→ W21-06 Multi-Tenant Isolation ────────────────┤
                   ├──→ W21-10 Zero Trust Expansion ──────────────────┤
                   │                                                   ↓
                   │                              Phase 11 — AI-Assisted Teaching
                   │                                 (نیازمند 9+10 داده و Policy)
                   │                                                   ↓
                   ├──→ W21-04 Internal AI Assistant (RBAC/Policy) ───┤
                   │                                                   ↓
                   │                              Phase 12 — School Ecosystem
                   │                                 (مالی/مکانی — نیازمند Audit کامل)
                   │                                                   ↓
                   │                              Phase 13 — National Interoperability
                   │                                 (نیازمند Identity تثبیت‌شده)
                   │                                                   ↓
                   │                              Phase 14 — Media Infrastructure
                   │                                 (Object Storage → CDN → Video)
                   │                                                   ↓
                   ├──→ W21-08 OLTP/OLAP ─────────────────────────────┤
                   │                                                   ↓
                   └──→ W21-05 National Observability ──→ Phase 15 — National Intelligence
```

### دو اصلاح مبتنی بر شواهد نسبت به ترتیب پیشنهادی مأموریت

1. **Phase 9.0 (Wiring Gate) پیش از 9.1 اضافه شد.** شواهد: هشت موتور آموزشی که Phase 9 قرار است رویشان بنا شود، همین حالا کد دارند اما `server-refs = 0`. ساختن 9.1 روی کد بدون اتصال، دقیقاً تکرار خطای فاز ۶ است. 9.0 اجباری و SERIAL است.
2. **W21-07 (Backup/DR + Restore Drill) و W21-06 (Multi-Tenant Isolation) جلو کشیده شدند** — به ترتیب به Phase 8.2 و 8.4. شواهد: R10/R11 هیچ مانور E4 ندارند و R3 گارد تننت را پراکنده نشان می‌دهد؛ اجرای Phase 10 (داده‌های سلامت روان و محرمانگی) روی زیرساختی که بازیابی‌اش اثبات نشده و مرز تننتش مرکزی نیست، غیرقابل‌قبول است.

**ترتیب شماره‌ای کورکورانه حفظ نشد؛ وابستگی واقعی اولویت دارد.**

---

## ۵. NATIONAL PLATFORM FOUNDATION TRACK (NPF-T)

Track مستقل زیرساختی — **پنهان‌شده لای قابلیت‌های آموزشی نیست**. این Track موازی با فازهای آموزشی اجرا می‌شود و هر قابلیت آموزشی به ردیف‌های آن cross-link دارد.

| ID | آیتم | وضعیت امروز | سطح شواهد | Sprint هدف | Cross-link |
|---|---|---|---|---|---|
| NPF-01 | PostgreSQL Source of Truth | VERIFIED | E3 | — (پایدار) | همهٔ فازها |
| NPF-02 | Redis Cache-only | VERIFIED | E3 | — (پایدار) | همهٔ فازها |
| NPF-03 | Transaction Manager | VERIFIED | E3 | — | 9.1, 12.3 |
| NPF-04 | Audit Ledger | VERIFIED | E3 | — | 10.2, 12.x |
| NPF-05 | Outbox | PARTIAL | E3 (پایه) | S5–S6 | 11.x, 13.5 |
| NPF-06 | Event Bus | PARTIAL | E2 | S5–S6 | W21-01, 15.x |
| NPF-07 | OCC | VERIFIED | E3 | — | 9.1 |
| NPF-08 | Conflict Persistence | VERIFIED | E3 | — | 9.3 |
| NPF-09 | Tenant Isolation | PARTIAL (R3) | E3 جزئی | S7–S8 | **W21-06**, 10.2 |
| NPF-10 | Authorization | VERIFIED | E3 | — | همهٔ فازها |
| NPF-11 | Identity | PARTIAL | E3 | S13–S16 | **13.6 Federation** |
| NPF-12 | Replay Protection | VERIFIED | E3 | — | 12.3, 13.x |
| NPF-13 | Canary | VERIFIED | E3 | — | هر انتشار |
| NPF-14 | Governance (Ed25519) | VERIFIED | E3 | — | 11.x (تأیید انسانی) |
| NPF-15 | Observability | PARTIAL (R22) | E1/E2 | S3–S4 | **W21-05** |
| NPF-16 | NOC | PARTIALLY_FIXED (B6) | E2 | S3–S4 | W21-05 |
| NPF-17 | WAF | VERIFIED (report-mode عمدی) | E3 | S21+ (enforce) | 8.5 |
| NPF-18 | Rate Limiting | PARTIAL (R18, R19) | E3 جزئی | S7–S8 | 10.x, 12.x |
| NPF-19 | Backup | NOT VERIFIED | E1 | **S3–S4** | **W21-07** |
| NPF-20 | Restore Drill | NOT VERIFIED | — | **S3–S4** | **W21-07** |
| NPF-21 | Disaster Recovery | NOT VERIFIED (R10/R11) | E1 | **S3–S4** | **W21-07** |
| NPF-22 | Multi-Region | PLANNED | E1 | S23–S26 | 13.x, 14.x |
| NPF-23 | Load Testing | NOT VERIFIED (R20 بسته، بار واقعی نه) | E1 | S5–S6 | **W21-09** |
| NPF-24 | Chaos Testing | PARTIAL | E2/E3 | S5–S6 | 8.3 |
| NPF-25 | CI/CD | VERIFIED (8.1) — اولین اجرا معاینه‌نشده | E3 | S1 | همهٔ فازها |
| NPF-26 | Production Truth Gate | VERIFIED ۴۴/۴۴ | E3 | — (هر فاز بازاجرا) | G9 |

---

## ۶. FUTURE PHASE SCHEDULE — برنامهٔ زمانی کل مسیر آینده

قاعدهٔ زمان: هر مدت یک **PLANNING ESTIMATE** است (۱ Sprint = ۱ هفته)، نه ادعای تاریخی. هیچ فاز بزرگی با «بعداً» رها نشده.

### ۶.۱ PHASE 8 — Zero-Trust Closure (باقی‌مانده)

| Phase | عنوان | مدت (PLANNING ESTIMATE) | Entry Criteria | Exit Criteria | Risk |
|---|---|---|---|---|---|
| 8.1 | رفع R5/R15/R16/R20 | **انجام‌شده** (Actual: 2026-09-19) | — | صفر 🔴؛ باتری ۱۲۷/۱۲۷ | — |
| 8.2 | Observability & DR Drill | **PARTIAL — Evidence Reconciliation** | 8.1 VERIFIED + اولین اجرای CI **اکنون VERIFIED** | SLO/metrics/remediation تحویل شده؛ **Exit evidence تفصیلی alert→on-call→runbook و restore PG+Redis هنوز باید به run/artifact قابل بازتولید نگاشت شود** | Evidence gap |
| 8.3 | Scale & Performance Hardening | **4 Sprint** | **8.2 EXIT VERIFIED** | p95/p99 تحت بار مشخص (E3/E4)؛ soak چندنمونه با واگرایی کمّی‌شدهٔ کنترل‌پلن؛ بوت سرد <۳۰s؛ R21 دفتر مهاجرت؛ R17 engines | **BLOCKED تا Gate 8.2** |
| 8.4 | Advanced Security Review | **3 Sprint** | 8.1 (نه 8.3) | اجبار مرکزی تننت با تست شکست روی روت بدون annotation؛ بازبینی خصمانه؛ کیت سخت‌سازی tenant_policy | R3 روی مسیرهای legacy پرتعداد |
| 8.5 | Production Certification Gate | **2 Sprint** | 8.1–8.4 همه exit | ۷ شرط §۶ گزارش ورودی فاز ۸ + **WAF enforce** + بازگواهی Red Team مستقل | هر 🟠 باز = BLOCKED |

**جمع فاز ۸ باقی‌مانده: ۱۲ Sprint.**

### ۶.۲ PHASE 9 — Educational Foundation

| Phase | عنوان | مدت | Dependency | Entry | Exit | Risk |
|---|---|---|---|---|---|---|
| **9.0** | **Wiring Gate (بستن F-EI-01)** | **2 Sprint** | 8.1 | ۸ موتور با server-refs=۰ شناسایی‌شده | هر ۸ موتور از مسیر HTTP واقعی فراخوانی می‌شوند؛ تست رفتاری E3 برای هرکدام؛ تست گارد که ماژول analytics بدون route را رد می‌کند | ممکن است بازطراحی قرارداد لازم شود |
| 9.1 | Advanced Assessment Engine | 4 Sprint | 9.0 + NPF-07 | 9.0 exit | KPI versioned؛ محاسبه بازتولیدپذیر از داده خام؛ E3 روی PG زنده | کیفیت داده تاریخی |
| 9.2 | Digital Parent Consent / Signature | 3 Sprint | 9.0 + NPF-04 + NPF-12 | 9.1 مدل داده قفل | امضا با زنجیرهٔ آدیت غیرقابل‌انکار؛ Replay-safe | الزامات حقوقی |
| 9.3 | Student Skill Portfolio | 3 Sprint | 9.1 + NPF-08 | 9.1 exit | Timeline چندساله؛ offline-safe | حجم داده |
| 9.4 | Parent Engagement Foundation | 3 Sprint | 9.2 + NPF-18 | 9.2 exit | اعلان permission-safe؛ نرخ ack | بمباران اعلان |

**جمع Phase 9: ۱۵ Sprint.**

### ۶.۳ PHASE 10 — Student Guidance & Wellbeing

> **قاعدهٔ سخت:** این فاز پیش از آماده‌بودن Identity، RBAC، Tenant Isolation و Audit اجرا نمی‌شود → Entry مشروط به **8.4 exit** است.

| Phase | عنوان | مدت | Dependency | Exit | Risk |
|---|---|---|---|---|---|
| 10.1 | Mental Health / Counselor Platform | 4 Sprint | 8.4 + 9.3 | داده حساس با رمزگذاری میدانی؛ E3 | حقوقی/اخلاقی — بالاترین |
| 10.2 | Confidentiality + Field-Level Authorization | 3 Sprint | 10.1 + NPF-09/10 | مجوز در سطح فیلد با تست نفوذ | نشت داده |
| 10.3 | Career Guidance | 3 Sprint | 9.3 + 10.2 | — | — |
| 10.4 | Talent Discovery | 2 Sprint | 10.3 | ضدِ برچسب‌زنی ناعادلانه | سوگیری |
| 10.5 | Early Warning System (= **W21-03**) | 3 Sprint | 9.1 + 9.3 + 10.2 | قاعده‌محور پیش از ML؛ Case Management کامل | هشدار کاذب |

**جمع Phase 10: ۱۵ Sprint.**

### ۶.۴ PHASE 11 — AI-Assisted Teaching

> AI پیش از آماده‌بودن داده، Policy، RBAC، Audit و Privacy وارد تولید ملی نمی‌شود → Entry: **9.x + 10.2 + NPF-14**.

| Phase | عنوان | مدت | Exit | Risk |
|---|---|---|---|---|
| 11.0 | AI Governance Gate (= **W21-04**) | 2 Sprint | RBAC/Policy برای هر فراخوان AI؛ لاگ کامل prompt/response؛ human-in-the-loop اجباری | حاکمیتی |
| 11.1 | AI Teaching Assistant | 4 Sprint | E3 + fairness audit | توهم مدل |
| 11.2 | AI Lesson Planning | 3 Sprint | — | — |
| 11.3 | Personalized Exercises | 3 Sprint | — | — |
| 11.4 | Learning Analytics | 3 Sprint | بازتولیدپذیری هر شاخص | — |
| 11.5 | Teacher Intelligence Tools | 3 Sprint | **بدون رتبه‌بندی خودکار** (قاعدهٔ V3 §C) | سوءاستفادهٔ ارزیابی |

**جمع Phase 11: ۱۸ Sprint.**

### ۶.۵ PHASE 12 — School Ecosystem

| Phase | عنوان | مدت | Dependency | Exit | Risk |
|---|---|---|---|---|---|
| 12.1 | Smart Transportation / GPS | 4 Sprint | NPF-04 + 10.2 | حریم مکانی؛ نگهداشت محدود | ردیابی کودک — حساسیت بالا |
| 12.2 | Smart Cafeteria | 3 Sprint | 12.3 | — | — |
| 12.3 | Student Wallet | 4 Sprint | NPF-03 + NPF-04 + NPF-12 | تراکنش مالی اتمی؛ آدیت غیرقابل‌انکار؛ تست تقلب | **مالی — بالاترین ریسک** |
| 12.4 | Advanced Parent Portal | 3 Sprint | 9.4 + 12.3 | — | — |

**جمع Phase 12: ۱۴ Sprint.**

### ۶.۶ PHASE 13 — National Interoperability

> پس از تثبیت Identity و Authorization داخلی → Entry: **NPF-11 VERIFIED**.

| Phase | عنوان | مدت | Exit | Risk |
|---|---|---|---|---|
| 13.1 | SIDA Integration | 4 Sprint | قرارداد + reconciliation | وابستگی برون‌سازمانی |
| 13.2 | MyMedu Integration | 3 Sprint | — | همان |
| 13.3 | Shahkar / Registry | 3 Sprint | احراز هویت ملی | حاکمیتی |
| 13.4 | National API Contracts | 3 Sprint | versioned + contract tests | شکست سازگاری |
| 13.5 | Synchronization / Reconciliation | 4 Sprint | صفر واگرایی اثبات‌شده | تعارض داده |
| 13.6 | Identity Federation | 4 Sprint | SSO ملی با fail-closed | بالاترین امنیتی |

**جمع Phase 13: ۲۱ Sprint.**

### ۶.۷ PHASE 14 — Educational Media Infrastructure

| Phase | عنوان | مدت | Exit | Risk |
|---|---|---|---|---|
| 14.1 | Object Storage | 3 Sprint | S3-compatible + نگهداشت | هزینه |
| 14.2 | CDN (بستن R24) | 2 Sprint | تحویل لبه با اعتبارسنجی کش | هزینه ملی |
| 14.3 | Media Processing | 3 Sprint | صف async (NPF-05/06) | CPU |
| 14.4 | Video Infrastructure | 4 Sprint | مدل هزینه مستند | **هزینه در مقیاس ۱۰M** |
| 14.5 | Audio Infrastructure | 2 Sprint | — | — |
| 14.6 | Media Governance / Retention | 3 Sprint | سیاست حذف + آدیت | حقوقی |

**جمع Phase 14: ۱۷ Sprint.**

### ۶.۸ PHASE 15 — National Educational Intelligence

| Phase | عنوان | مدت | Dependency | Exit | Risk |
|---|---|---|---|---|---|
| 15.1 | National Analytics (= **W21-08** پایه) | 4 Sprint | 9.x + 13.5 | drill-down مجوزمحور | — |
| 15.2 | OLTP / OLAP Separation | 4 Sprint | NPF-01 + Phase 8.7 addendum | PG همچنان SSoT؛ replica تحلیلی | دوگانگی مرجع |
| 15.3 | Longitudinal Student Models | 4 Sprint | 9.3 + 15.2 | — | — |
| 15.4 | National Learning Intelligence | 4 Sprint | 15.3 | — | — |
| 15.5 | Advanced AI Models | 6 Sprint | 11.x + 15.4 | fairness + monitoring اجباری | سوگیری ملی |
| 15.6 | National Educational Decision Support | 4 Sprint | 15.5 | تصمیم حساس فقط با انسان مجاز | حاکمیتی |

**جمع Phase 15: ۲۶ Sprint.**

---

## ۷. WAVE 21 — زمان‌بندی‌شده در جای درست Dependency Graph

آیتم‌های Wave 21 دیگر `PLANNED` معلق نیستند. **سه مورد جلو کشیده شدند** چون پیش‌نیاز فازهای بعدی‌اند:

| ID | عنوان | جای اصلاح‌شده | مدت | چرا اینجا؟ (شواهد) | وضعیت |
|---|---|---|---|---|---|
| **W21-07** | Backup & DR — RPO/RTO + Restore Drill | **Phase 8.2** (جلو کشیده شد) | 3 Sprint | R10/R11: هیچ مانور failover E4 وجود ندارد؛ هیچ فاز آموزشی روی زیرساخت بازیابی‌نشده مجاز نیست | PLANNED |
| **W21-05** | National Observability Platform | **Phase 8.2** (هم‌زمان) | 3 Sprint | R22: رصد ساخته شده ولی هرگز مانور نشده؛ B6 هاردکد NOC | PLANNED |
| **W21-09** | Adaptive Load Management | **Phase 8.3** | 2 Sprint | R14/R12: بار مسیر routing اثبات نشده | PLANNED |
| **W21-06** | Advanced Multi-Tenant Isolation | **Phase 8.4** (جلو کشیده شد) | 3 Sprint | R3: گارد تننت فقط `/api/v1/*`؛ پیش‌نیاز Phase 10 (داده حساس) | PLANNED |
| **W21-10** | Zero Trust Expansion | **Phase 8.4/8.5** | 2 Sprint | تعمیم مدل فعلی به همهٔ سطوح | PLANNED |
| **W21-01** | Smart Notification Engine | **Phase 9.4** | 3 Sprint | نیازمند NPF-05/06 (Outbox/Event Bus) و مدل اعلان permission-safe | PLANNED |
| **W21-03** | Early Warning System | **Phase 10.5** (ادغام شد) | — | همان قابلیت است؛ تکرار حذف شد | PLANNED |
| **W21-04** | Internal AI Assistant با RBAC/Policy | **Phase 11.0** (گیت حاکمیتی AI) | 2 Sprint | هیچ AI پیش از گیت حاکمیتی | PLANNED |
| **W21-08** | National Analytics — OLTP/OLAP | **Phase 15.1/15.2** | — | نیازمند 13.5 reconciliation | PLANNED |
| **W21-02** | School Digital Twin | **Phase 15.4+** | 4 Sprint | بالاترین وابستگی داده؛ پس از مدل‌های طولی | PLANNED |

---

## ۷.۱ WAVE 22 — نگاشت «Educational Ecosystem Expansion» به فازها

`docs/ROADMAP.md` §۳۶ (کامیت `81a34ef8`، ۲۰۲۶-۰۹-۲۰) ده قابلیت W22 را تعریف کرد. آن تعاریف **مرجع دامنه و جزئیات هر قابلیت‌اند**؛ زمان‌بندی و ترتیبشان از همین سند خوانده می‌شود. هیچ‌کدام `[Planned]` بی‌تاریخ باقی نماندند:

| ID | عنوان | فاز مقصد | Sprint | نوع موازی‌سازی | پیش‌نیاز سخت |
|---|---|---|---|---|---|
| W22-01 | Advanced Assessment Engine | **9.1** | S16–S19 | SERIAL | 9.0 Wiring Gate |
| W22-02 | AI Teaching Assistant | **11.1** | S46–S49 | PARALLEL-WITH-DEPENDENCY | 11.0 AI Governance Gate |
| W22-03 | Student Mental Health & Counselor Platform | **10.1** | S29–S32 | SERIAL | 8.4 exit (مرز تننت مرکزی) |
| W22-04 | Career Guidance & Talent Discovery | **10.3 + 10.4** | S36–S40 | PARALLEL-SAFE (بین خودشان) | 10.2 مجوز میدانی |
| W22-05 | Parent Engagement Portal | **9.4 + 12.4** | S26–S28, S73–S75 | PARALLEL-WITH-DEPENDENCY | 9.2 Consent |
| W22-06 | Smart Transportation Platform | **12.1** | S66–S69 | PARALLEL-WITH-DEPENDENCY | 10.2 + 12.3 |
| W22-07 | Smart Cafeteria & Student Wallet | **12.2 + 12.3** | S62–S65, S70–S72 | **SERIAL** (Wallet) | NPF-03/04/12 |
| W22-08 | Student Skill Portfolio | **9.3** | S23–S25 | SERIAL نسبت به 9.1 | 9.1 مدل ارزیابی |
| W22-09 | National Interoperability Layer (فقط طراحی) | **13.4 + 13.5** | S90–S96 | SERIAL | 13.6 Federation |
| W22-10 | Media Learning Infrastructure Preparation | **14.1–14.3** | S97–S104 | SERIAL سپس PARALLEL-SAFE | 8.5 exit |

> نکتهٔ انطباق: W22-09 در سند مبدأ صراحتاً **«فقط طراحی»** برچسب خورده؛ در برنامهٔ مرجع نیز تا پیش از استقرار 13.6 حق ورود به پیاده‌سازی ندارد.

## ۸. RESEARCH-ONLY TRACK — ورود به اجرای اصلی ممنوع

| # | آیتم | Research Trigger | Prerequisites | Decision Gate | Potential Phase |
|---|---|---|---|---|---|
| RS-1 | **Federated Learning** | وقتی ≥۳ استان داده‌ٔ مدل‌پذیر با منع انتقال داشته باشند | 15.3 + NPF-22 | کمیتهٔ حریم خصوصی + اثبات کاهش دقت <۵٪ | Phase 16 |
| RS-2 | **Differential Privacy** | اولین درخواست انتشار عمومی آمار سطح مدرسه | 15.1 | اثبات ε مورد توافق + آزمون بازشناسایی | Phase 15.6+ |
| RS-3 | **National Digital Identity نسل بعد** | تغییر سیاست ملی هویت | 13.6 مستقر و پایدار | مصوبهٔ حاکمیتی برون‌سازمانی | Phase 16 |
| RS-4 | **Blockchain در Governance** | وقتی دفتر Ed25519 فعلی برای عدم‌انکار ناکافی اثبات شود | NPF-14 + ممیزی مستقل | **باید ابتدا ناکافی‌بودن راهکار فعلی اثبات شود** (نه بالعکس) | Phase 17 (شرطی) |
| RS-5 | **Curriculum Intelligence** | پس از ۲ سال تحصیلی دادهٔ طولی معتبر | 15.3 + 11.4 | اعتبارسنجی آموزشی توسط متخصص برنامهٔ درسی | Phase 15.4+ |
| RS-6 | **Edge Computing** | وقتی latency مناطق دورافتاده SLO را نقض کند | 14.2 CDN + سنجش واقعی latency | اثبات نقض SLO با داده | Phase 14.2+ |
| RS-7 | **شبیه‌ساز ۱۰M–۵۰M کاربر** | پیش از هر ادعای ظرفیت ملی | NPF-23 + محیط بار واقعی | **هزینهٔ زیرساخت تأییدشده** — این مورد شرط لازم ادعای «مقیاس ملی» است | Phase 8.3 / NPF-23 |

**انطباق با `docs/ROADMAP.md` §۳۵ و §۳۷:** هفت طرح تحقیقاتی R-01..R-07 آن سند یک‌به‌یک با ردیف‌های بالا منطبق‌اند و هیچ‌کدام مجوز ورود به اجرا ندارند:

| ROADMAP.md §۳۵ | معادل در این سند | وضعیت |
|---|---|---|
| R-01 Federated Learning آموزشی | RS-1 | RESEARCH |
| R-02 Privacy Preserving Analytics | RS-2 (Differential Privacy) | RESEARCH |
| R-03 Digital Identity ملی آموزشی | RS-3 | RESEARCH |
| R-04 Blockchain Audit Ledger | RS-4 | RESEARCH — **شرط معکوس:** ابتدا باید ناکافی‌بودن دفتر Ed25519 فعلی اثبات شود |
| R-05 AI Curriculum Intelligence | RS-5 | RESEARCH |
| R-06 Edge Computing مدارس کم‌اتصال | RS-6 | RESEARCH |
| R-07 National Simulation Environment | RS-7 | RESEARCH — **اما پیش‌نیاز هر ادعای ظرفیت ملی** |

> RS-7 اگرچه Research برچسب خورده، **پیش‌نیاز صدور هر گواهی مقیاس ملی است** — بدون آن، هیچ عدد ظرفیتی در این پروژه حق برچسب VERIFIED ندارد.

---

## ۹. GATE MODEL — گیت‌های ملی

هیچ فاز صرفاً با PASS شدن unit test وارد فاز بعد نمی‌شود.

| Gate | نام | شرط عبور | سطح شواهد لازم | ابزار موجود در مخزن |
|---|---|---|---|---|
| **G0** | Git Truth Gate | HEAD واقعی استخراج‌شده؛ هر کامیت ادعایی با `git show` تأیید؛ CODE/DOC جدا | E1 (اما اجباری) | `skills/evidence-integrity-and-commit-accounting` |
| **G1** | Architecture Gate | بدون منبع دوم حقیقت؛ بدون RAM authority جدید؛ بدون dead-code | E2 | `tests/unified-production-verifier.js` |
| **G2** | Database Gate | مهاجرت وجود دارد + زنجیره اجرا می‌شود + اسکیما روی PG واقعی تأیید | E3 | `tests/migration-sequence.js`، `migrate-pg-constraints.js` |
| **G3** | Security Gate | احراز هویت + مجوز + ایزولاسیون تننت + fail-closed | E3 | `tests/wave5-authz.js`، `waf-enforce.js`، `public-security.js` |
| **G4** | Runtime Integration Gate | مسیر واقعی HTTP فراخوانی می‌شود (نه فقط تست ماژولی) | E3 | `tests/server17.js`، canary-atomic-live |
| **G5** | Multi-Instance Gate | ≥۲ نمونه با PG+Redis مشترک، صفر واگرایی | E3/E4 | `tests/wave18w19-multinode-live.js` |
| **G6** | Failure/Chaos Gate | kill/outage/latency/disk تزریق و بازیابی اثبات‌شده | E4 | `tools/chaos-test.sh`، `wave19-chaos.js` |
| **G7** | Scale Gate | بار هدف با p50/p95/p99 ثبت‌شده روی dataset واقع‌گرایانه | E4 | `tests/wave18-load-test.js` (harness) |
| **G8** | Observability Gate | متریک+لاگ+trace+داشبورد+**مانور آلارم تا اقدام انسانی** | E4 | `docs/INCIDENT_PLAYBOOK.md` + metrics endpoint |
| **G9** | Production Truth Gate | ۴۴/۴۴ VERIFIED روی CODE_COMMIT نهایی همان فاز | E3 | `tools/production-truth-gate` |
| **G10** | National GO Gate | همهٔ G0–G9 + بازگواهی Red Team مستقل + صفر 🔴/🟠 | E4 | ممیزی مستقل جدید |

### ماتریس گیت × فاز (کدام فاز کدام گیت را باید عبور کند)

| فاز | G0 | G1 | G2 | G3 | G4 | G5 | G6 | G7 | G8 | G9 | G10 |
|---|---|---|---|---|---|---|---|---|---|---|---|
| 8.2 | ✔ | ✔ | — | ✔ | ✔ | ✔ | ✔ | — | ✔ | ✔ | — |
| 8.3 | ✔ | ✔ | ✔ | — | ✔ | ✔ | ✔ | ✔ | ✔ | ✔ | — |
| 8.4 | ✔ | ✔ | — | ✔ | ✔ | — | — | — | — | ✔ | — |
| 8.5 | ✔ | ✔ | ✔ | ✔ | ✔ | ✔ | ✔ | ✔ | ✔ | ✔ | **✔** |
| 9.0 | ✔ | ✔ | — | ✔ | **✔** | — | — | — | — | ✔ | — |
| 9.x | ✔ | ✔ | ✔ | ✔ | ✔ | — | — | — | — | ✔ | — |
| 10.x | ✔ | ✔ | ✔ | **✔** | ✔ | ✔ | — | — | ✔ | ✔ | — |
| 11.x | ✔ | ✔ | ✔ | ✔ | ✔ | — | — | ✔ | ✔ | ✔ | — |
| 12.x | ✔ | ✔ | ✔ | **✔** | ✔ | ✔ | ✔ | ✔ | ✔ | ✔ | — |
| 13.x | ✔ | ✔ | ✔ | ✔ | ✔ | ✔ | ✔ | ✔ | ✔ | ✔ | ✔ |
| 14.x | ✔ | ✔ | — | ✔ | ✔ | — | — | ✔ | ✔ | ✔ | — |
| 15.x | ✔ | ✔ | ✔ | ✔ | ✔ | ✔ | ✔ | ✔ | ✔ | ✔ | ✔ |

---

## ۱۰. DEFINITION OF DONE — هیچ فاز بدون این هفت ستون Completed نیست

```text
CODE       ☐ implementation exists
           ☐ runtime path is wired  (اثبات: grep require-graph غیرصفر + فراخوان HTTP واقعی)
           ☐ no dead-code-only implementation

DATABASE   ☐ migration exists
           ☐ migration chain works  (اثبات: migration-sequence سبز روی PG واقعی)
           ☐ PostgreSQL schema verified

TESTS      ☐ behavioral tests executed  (نه صرفاً grep سورس)
           ☐ no silent skip
           ☐ no fake-green exit 0

RUNTIME    ☐ actual runtime execution
           ☐ multi-instance where applicable
           ☐ failure mode tested

SECURITY   ☐ authentication
           ☐ authorization
           ☐ tenant isolation
           ☐ fail-closed behavior

SCALE      ☐ load assumptions documented
           ☐ relevant scale test exists

EVIDENCE   ☐ exact commit (SHA)
           ☐ exact command
           ☐ exact result
           ☐ timestamp + environment (نسخهٔ PG/Redis/Node)
```

**Scale مرجع که هر ردیف SCALE باید علیه آن سنجیده شود:**

| بُعد | هدف |
|---|---|
| Registered users | 10,000,000 |
| Concurrent users | 2,500,000 |
| Peak RPS | 20,000 |
| Write TPS | 2,500 |
| Events/s | 25,000 |
| Stable DB connections | 3,500 |

این اعداد در ترتیب معماری، Database (پارتیشن + replica + PgBouncer)، Cache (L1/L2 + epoch)، Outbox/Eventing (NPF-05/06)، Multi-Tenant (NPF-09)، Observability (NPF-15/16)، DR (NPF-19/20/21)، Security (NPF-17/18) و Load Testing (NPF-23) لحاظ شده‌اند.

---

## ۱۱. CALENDAR / SPRINT PLAN — جدول نهایی اجرا

`Seq` = ترتیب اجرایی اجباری. برای ردیف‌های تاریخی، Duration از تاریخ کامیت‌های Git استخراج شده (`Actual`). برای آینده، همه با برچسب صریح `PLANNING ESTIMATE`.

### ۱۱.۱ ردیف‌های تاریخی

| Seq | Sprint | Phase | Deliverable | Dependency | Duration | Status |
|---|---|---|---|---|---|---|
| 01 | Historical | Pre-Phase / Client | ساختار ماژولار + فاز ۰ تصمیمات قفل‌شده | — | Actual 2026-09-01→09-09 | VERIFIED |
| 02 | Historical | Auth Server | تلفن+OTP+کد ملی، JWT، sync، IDOR | 01 | Actual 2026-09-06 | VERIFIED |
| 03 | Historical | Wave -1/0 | Architecture Discovery + Baseline | 02 | Actual 2026-09-08 | VERIFIED |
| 04 | Historical | Wave 1 | **PostgreSQL Source of Truth** | 03 | Actual 2026-09-09 | VERIFIED |
| 05 | Historical | Wave 2 | Database Engineering + migrations 001–003 | 04 | Actual 2026-09-09 | VERIFIED |
| 06 | Historical | Wave 5 | Authorization + Tenant Isolation | 04 | Actual 2026-09-10 | VERIFIED |
| 07 | Historical | Wave 3/4/6/7 | Query/Sync/Redis/Offline | 04,05 | Actual 2026-09-11→09-12 | **PARTIAL** |
| 08 | Historical | Wave 9/10/11 | Performance + DB Scale + Cache | 07 | Actual 2026-09-12 | **PARTIAL** |
| 09 | Historical | Wave 12/13 | Edge + Security Program | 06 | Actual 2026-09-10→09-11 | **PARTIAL** |
| 10 | Historical | Wave 14–17 | Observability/Health/DR/Testing | 08 | Actual 2026-09-10→09-11 | **PARTIAL** |
| 11 | Historical | Wave 18/19 | National Load + Chaos | 10 | Actual 2026-09-09→09-10 | **NOT VERIFIED** |
| 12 | Historical | Wave 20/21/23/24 | Arenas + چندپایه + گزارش DB-native + Perf | 10 | Actual 2026-09-10→09-12 | VERIFIED |
| 13 | Historical | EI Phase 3 | P0-EI-01…21 (۲۱ گام هوشمندی) | 04,06 | Actual 2026-09-17→09-18 | **PARTIAL** (F-EI-01) |
| 14 | Historical | SC Phase 4 | P1-SC-01…07 | 13 | Actual 2026-09-18 | **PARTIAL** |
| 15 | Historical | PL/NI Phase 5 | P2-PL-01/02 + P2-NI-01…05 + Steps 08–12 | 14 | Actual 2026-09-18 | **PARTIAL / REJECTED** |
| 16 | Historical | Phase 6 | Canary rollout + «۱۰۰٪ cutover» | 15 | Actual 2026-09-18 | **FAILED / REJECTED** |
| 17 | Historical | Phase 6 RT | Red Team verdict → B1–B10 remediation | 16 | Actual 2026-09-18→09-19 | REMEDIATED |
| 18 | Historical | Phase 6.5/6.6 | Ed25519 + Replay ledger + truth-gate | 17 | Actual 2026-09-19 | VERIFIED |
| 19 | Historical | Phase 7 → 7.6-R.7.2 | بازنشانی ریشه‌ای PG authority + ۱۳ دور سخت‌سازی | 18 | Actual 2026-09-19 | VERIFIED |
| 20 | Historical | Phase 8 Entry | ممیزی ورودی زیروتراست (R1–R25) | 19 | Actual 2026-09-19 | VERIFIED |
| 21 | Historical | **Phase 8.1** | رفع R5/R15/R16/R20 + باتری ۱۲۷/۱۲۷ + CI اجباری | 20 | Actual 2026-09-19 | **VERIFIED** |

### ۱۱.۲ ردیف‌های آینده

| Seq | Sprint | Phase | Deliverable | Dependency | Duration | Status |
|---|---|---|---|---|---|---|
| 22 | S1 | 8.1-post | معاینهٔ اولین اجرای CI (باتری A–D) + بستن F-CI-01 | 21 | Actual / verified on Node.js CI #1093 | **VERIFIED** |
| 23 | S2 | 8.2 | تصمیم R6/R7 + انتشار SLO | 22 | Delivered | **PARTIAL / evidence reconciliation** |
| 24 | S3–S4 | 8.2 / **W21-05** + **W21-07** | مانور alert→on-call + **مانور restore واقعی PG/Redis** (NPF-19/20/21) | 23 | Evidence reconciliation / execution as required | **NOT VERIFIED** |
| 25 | S5–S6 | 8.3 / NPF-23/24 | بار واقعی + chaos + Outbox/Event Bus کامل | 24 | 2 weeks · PLANNING ESTIMATE | PLANNED |
| 26 | S7–S8 | 8.3 / **W21-09** | soak چندنمونه + R1 واگرایی + R21 دفتر مهاجرت + R13/R14/R17 | 25 | 2 weeks · PLANNING ESTIMATE | PLANNED |
| 27 | S9–S11 | 8.4 / **W21-06** + **W21-10** | اجبار مرکزی تننت + کیت tenant_policy + بازبینی خصمانه | 22 | 3 weeks · PLANNING ESTIMATE | PLANNED |
| 28 | S12–S13 | 8.5 | **WAF enforce** + بازگواهی Red Team + G10 | 26,27 | 2 weeks · PLANNING ESTIMATE | PLANNED |
| 29 | S14–S15 | **9.0** | **Wiring Gate — بستن F-EI-01 (۸ موتور)** | 28, G3, G4, G9 | 2 weeks · PLANNING ESTIMATE | PLANNED |
| 30 | S16–S19 | 9.1 | Advanced Assessment Engine | 29 | 4 weeks · PLANNING ESTIMATE | PLANNED |
| 31 | S20–S22 | 9.2 | Digital Parent Consent / Signature | 30 | 3 weeks · PLANNING ESTIMATE | PLANNED |
| 32 | S23–S25 | 9.3 | Student Skill Portfolio | 30 | 3 weeks · PLANNING ESTIMATE | PLANNED |
| 33 | S26–S28 | 9.4 / **W21-01** | Parent Engagement + Smart Notification Engine | 31 | 3 weeks · PLANNING ESTIMATE | PLANNED |
| 34 | S29–S32 | 10.1 | Mental Health / Counselor Platform | 28,32 | 4 weeks · PLANNING ESTIMATE | PLANNED |
| 35 | S33–S35 | 10.2 | Confidentiality + Field-Level Authorization | 34 | 3 weeks · PLANNING ESTIMATE | PLANNED |
| 36 | S36–S38 | 10.3 | Career Guidance | 35 | 3 weeks · PLANNING ESTIMATE | PLANNED |
| 37 | S39–S40 | 10.4 | Talent Discovery | 36 | 2 weeks · PLANNING ESTIMATE | PLANNED |
| 38 | S41–S43 | 10.5 / **W21-03** | Early Warning System + Case Management | 35 | 3 weeks · PLANNING ESTIMATE | PLANNED |
| 39 | S44–S45 | 11.0 / **W21-04** | AI Governance Gate (RBAC/Policy/Audit برای AI) | 35 | 2 weeks · PLANNING ESTIMATE | PLANNED |
| 40 | S46–S49 | 11.1 | AI Teaching Assistant | 39 | 4 weeks · PLANNING ESTIMATE | PLANNED |
| 41 | S50–S52 | 11.2 | AI Lesson Planning | 40 | 3 weeks · PLANNING ESTIMATE | PLANNED |
| 42 | S53–S55 | 11.3 | Personalized Exercises | 40 | 3 weeks · PLANNING ESTIMATE | PLANNED |
| 43 | S56–S58 | 11.4 | Learning Analytics | 41,42 | 3 weeks · PLANNING ESTIMATE | PLANNED |
| 44 | S59–S61 | 11.5 | Teacher Intelligence Tools (بدون رتبه‌بندی خودکار) | 43 | 3 weeks · PLANNING ESTIMATE | PLANNED |
| 45 | S62–S65 | 12.3 | **Student Wallet** (اول در Phase 12 — پیش‌نیاز 12.2) | 28,44 | 4 weeks · PLANNING ESTIMATE | PLANNED |
| 46 | S66–S69 | 12.1 | Smart Transportation / GPS | 35,45 | 4 weeks · PLANNING ESTIMATE | PLANNED |
| 47 | S70–S72 | 12.2 | Smart Cafeteria | 45 | 3 weeks · PLANNING ESTIMATE | PLANNED |
| 48 | S73–S75 | 12.4 | Advanced Parent Portal | 33,45 | 3 weeks · PLANNING ESTIMATE | PLANNED |
| 49 | S76–S79 | 13.6 | **Identity Federation** (اول در Phase 13 — پیش‌نیاز بقیه) | NPF-11 | 4 weeks · PLANNING ESTIMATE | PLANNED |
| 50 | S80–S83 | 13.1 | SIDA Integration | 49 | 4 weeks · PLANNING ESTIMATE | PLANNED |
| 51 | S84–S86 | 13.2 | MyMedu Integration | 49 | 3 weeks · PLANNING ESTIMATE | PLANNED |
| 52 | S87–S89 | 13.3 | Shahkar / Registry Integration | 49 | 3 weeks · PLANNING ESTIMATE | PLANNED |
| 53 | S90–S92 | 13.4 | National API Contracts | 50,51,52 | 3 weeks · PLANNING ESTIMATE | PLANNED |
| 54 | S93–S96 | 13.5 | Synchronization / Reconciliation | 53 | 4 weeks · PLANNING ESTIMATE | PLANNED |
| 55 | S97–S99 | 14.1 | Object Storage | 28 | 3 weeks · PLANNING ESTIMATE | PLANNED |
| 56 | S100–S101 | 14.2 | CDN (بستن R24) | 55 | 2 weeks · PLANNING ESTIMATE | PLANNED |
| 57 | S102–S104 | 14.3 | Media Processing | 55 | 3 weeks · PLANNING ESTIMATE | PLANNED |
| 58 | S105–S108 | 14.4 | Video Infrastructure | 56,57 | 4 weeks · PLANNING ESTIMATE | PLANNED |
| 59 | S109–S110 | 14.5 | Audio Infrastructure | 57 | 2 weeks · PLANNING ESTIMATE | PLANNED |
| 60 | S111–S113 | 14.6 | Media Governance / Retention | 58,59 | 3 weeks · PLANNING ESTIMATE | PLANNED |
| 61 | S114–S117 | 15.2 | **OLTP/OLAP Separation** (اول — زیرساخت 15.x) | 54 | 4 weeks · PLANNING ESTIMATE | PLANNED |
| 62 | S118–S121 | 15.1 / **W21-08** | National Analytics | 61 | 4 weeks · PLANNING ESTIMATE | PLANNED |
| 63 | S122–S125 | 15.3 | Longitudinal Student Models | 62 | 4 weeks · PLANNING ESTIMATE | PLANNED |
| 64 | S126–S129 | 15.4 / **W21-02** | National Learning Intelligence + School Digital Twin | 63 | 4 weeks · PLANNING ESTIMATE | PLANNED |
| 65 | S130–S135 | 15.5 | Advanced AI Models (+ fairness monitoring) | 64 | 6 weeks · PLANNING ESTIMATE | PLANNED |
| 66 | S136–S139 | 15.6 | National Educational Decision Support | 65 | 4 weeks · PLANNING ESTIMATE | PLANNED |
| 67 | S140 | **G10** | National GO Gate — بازگواهی نهایی مستقل | 66 | 1 week · PLANNING ESTIMATE | PLANNED |

**TOTAL_PLANNED_SPRINTS = ۱۴۰ Sprint (مسیر بحرانی کانونی — B-3 Remediation).**

> **قید صلب معماری (B-4 Remediation):**
> فاز ۹.۰ (Phase 9.0 Wiring Gate) **مطلقاً پیش از خروج کامل از فاز ۸.۵ (`Seq 28` و گیت `G9`) آغاز نخواهد شد**. وابستگی ردیف ۲۹ رسماً به `28, G3, G4, G9` مقید است و هرگونه آغاز پیش از موعد توسط اعتبارسنجی خودکار مسدود می‌گردد.

> **محاسبهٔ مسیر بحرانی کانونی (B-3 Remediation):**
> برای حذف خطای انحراف زمانی، مسیر بحرانی محاسباتی روی خط پایهٔ اجرای سریالی تثبیت شده است:
> $$\text{Critical Path} = \sum_{i=1}^{N} \text{Duration}(\text{Sprint}_i) = 140 \text{ Sprints}$$
> با موازی‌سازی مجاز بخش ۱۳ (NPF-T موازی + شاخه‌های PARALLEL-SAFE)، پتانسیل کاهش تقویمی وجود دارد، اما تا زمان اثبات تجربی در تقویم واقعی، مبنای محاسباتی صلب پروژه ۱۴۰ اسپرینت سریالی است.

---

## ۱۲. PARALLELIZATION MATRIX

قاعدهٔ سخت: هیچ دو Task فقط برای سرعت موازی اعلام نشده. هر Task که روی **Schema، Authority، Migration یا همان runtime path** اثر بگذارد، اجباراً SERIAL است.

| Task / Phase | نوع | دلیل مبتنی بر شواهد |
|---|---|---|
| 8.2 مانور DR (W21-07) | **PARALLEL-SAFE** | فقط زیرساخت؛ کد تولید را تغییر نمی‌دهد |
| 8.2 مانور Observability (W21-05) | **PARALLEL-SAFE** | مسیر رصد جداست |
| 8.2 تصمیم R6/R7 | PARALLEL-SAFE | تصمیم حاکمیتی، نه کد |
| 8.3 R21 دفتر مهاجرت | **SERIAL** | Migration path را دست می‌زند |
| 8.3 R14 کش routing | **SERIAL** | همان runtime path مسیریابی |
| 8.3 R1 کنترل‌پلن‌های RAM | **SERIAL** | Authority state |
| 8.3 R13 بوت سرد / R17 engines | PARALLEL-SAFE | مستقل از authority |
| 8.4 D1 اجبار مرکزی تننت | **SERIAL** | همان runtime path درخواست |
| 8.4 D3 کیت tenant_policy | PARALLEL-WITH-DEPENDENCY | وابسته به D1، ولی بخش template موازی |
| 8.5 WAF enforce | **SERIAL** | رفتار لبهٔ تولید |
| **9.0 Wiring Gate** | **SERIAL** | همان runtime path؛ پیش‌نیاز کل Phase 9 |
| 9.1 Assessment / 9.3 Portfolio | **SERIAL نسبت به هم** | هر دو روی schema نمرات/ارزیابی |
| 9.2 Consent / 9.4 Parent | **PARALLEL-WITH-DEPENDENCY** | schema جدا (consent/notification)، ولی وابسته به 9.1 مدل داده |
| 10.1 Mental Health | **SERIAL** | schema حساس جدید + مجوز میدانی |
| 10.2 Field-Level Authz | **SERIAL** | Authority/authorization |
| 10.3 Career / 10.4 Talent | **PARALLEL-SAFE** نسبت به هم | فقط خواندن از 9.3 |
| 10.5 Early Warning | PARALLEL-WITH-DEPENDENCY | خواندن‌محور، ولی نیازمند 10.2 |
| 11.0 AI Governance Gate | **SERIAL** | Policy/Audit مرکزی |
| 11.1–11.5 | **PARALLEL-WITH-DEPENDENCY** | همه پس از 11.0؛ 11.1 و 11.2 موازی‌پذیر، 11.4 وابسته به هر دو |
| 12.3 Wallet | **SERIAL** | schema مالی + تراکنش |
| 12.1 GPS / 12.2 Cafeteria / 12.4 Portal | PARALLEL-WITH-DEPENDENCY | همه پس از 12.3 |
| 13.6 Federation | **SERIAL** | Identity core |
| 13.1/13.2/13.3 | **PARALLEL-SAFE** پس از 13.6 | سه سامانهٔ برون‌سازمانی مستقل |
| 13.4/13.5 | **SERIAL** | قرارداد و reconciliation روی همه |
| 14.1 Object Storage | **SERIAL** | پایهٔ بقیهٔ 14.x |
| 14.2–14.5 | **PARALLEL-SAFE** پس از 14.1 | مسیرهای مستقل رسانه |
| 15.2 OLTP/OLAP | **SERIAL** | مسیر داده |
| 15.1/15.3 | PARALLEL-WITH-DEPENDENCY | پس از 15.2 |
| 15.5/15.6 | **SERIAL** | مدل ملی + تصمیم‌یار |
| **کل NPF-T** | **PARALLEL-SAFE نسبت به فازهای آموزشی** | اما ردیف‌های SERIAL درونش (NPF-05/06/09/11) ترتیب خود را دارند |

---

## ۱۳. RISK / BLOCKER REGISTER

| ID | ریسک | شدت | وضعیت | اثر بر برنامه | کاهش‌دهنده |
|---|---|---|---|---|---|
| **RISK-O-007** | انسداد بیلینگ GitHub Actions — CI تاریخاً اجرا نشده | 🔴 | **RESOLVED** | Node.js CI #1093 روی HEAD فعلی با موفقیت اجرا شد | ادامهٔ پایش CI؛ blocker قدیمی دیگر مانع Seq 22 نیست |
| RISK-I-001 | نبود محیط استیجینگ دائمی | 🟠 | OPEN | مانورهای E4 (G5/G6/G7/G8) بدون آن ممکن نیست | Seq 24 نیازمند تأمین زیرساخت |
| RISK-A-001 | **F-EI-01** — ۸ موتور آموزشی بدون اتصال | 🟠 | OPEN | کل Phase 9 روی آن بنا می‌شود | Phase 9.0 Wiring Gate (SERIAL، اجباری) |
| RISK-A-002 | R1 — پنج کنترل‌پلن RAM | 🟠 | OPEN | مانع G5 (Multi-Instance) | 8.3 / C2 |
| RISK-D-001 | R10/R11 — هیچ مانور failover | 🟠 | OPEN | مانع G6 و کل Phase 10+ | 8.2 / W21-07 |
| RISK-S-001 | R3 — گارد تننت پراکنده | 🟠 | OPEN | مانع Phase 10 (داده حساس) | 8.4 / D1 + W21-06 |
| RISK-S-007 | WAF در report-mode | 🟡 | پذیرفته‌شده (عمدی) | enforce شرط 8.5 | هشدار بوت پرصدا (فاز ۸.۱) |
| RISK-P-001 | بار ملی ۱۰M هرگز اجرا نشده (NPF-23 / RS-7) | 🔴 | OPEN | **هیچ ادعای ظرفیت ملی مجاز نیست** | 8.3 + هزینهٔ زیرساخت |
| RISK-G-001 | ادعاهای «۱۰۰٪» در اسناد تاریخی | 🟠 | مهار شد | سردرگمی اجراکنندگان بعدی | همین سند: بخش ۱ وضعیت واقعی را ثبت کرد |
| RISK-DOC-001 | R23 — ۴۶۸ سند در `docs/` | 🟡 | OPEN | ریسک کشف/ناسازگاری | 8.4 تمیزکاری + `DOCS_INDEX.md` |
| RISK-E-001 | وابستگی به سامانه‌های برون‌سازمانی (SIDA/MyMedu/Shahkar) | 🟠 | PLANNED | Phase 13 ممکن است چند Sprint کشیده شود | قرارداد زودهنگام + mock contract tests |
| RISK-C-001 | هزینهٔ زیرساخت ویدئو در مقیاس ملی | 🟠 | PLANNED | Phase 14.4 ممکن است بازطراحی شود | مدل هزینه پیش از اجرا (Exit 14.4) |

---

## ۱۴. ترتیب اجرایی از امروز تا پایان برنامه (خلاصهٔ تصمیم‌گیری)

```text
امروز (2026-09-21، HEAD fbe178be)
   ↓
S1        معاینهٔ اولین CI  ───────────────────── VERIFIED (#1093)
   ↓
S2–S13    PHASE 8 باقی‌مانده (8.2 → 8.3 → 8.4 → 8.5)
          ‖ NPF-T موازی: DR/Restore، Observability، Load، Outbox
   ↓
S14–S15   PHASE 9.0 WIRING GATE  ─────────────── بستن F-EI-01 (اجباری، SERIAL)
   ↓
S16–S28   PHASE 9 Educational Foundation
   ↓
S29–S43   PHASE 10 Guidance & Wellbeing  ──────── فقط پس از 8.4
   ↓
S44–S61   PHASE 11 AI-Assisted Teaching  ──────── فقط پس از 11.0 Governance Gate
   ↓
S62–S75   PHASE 12 School Ecosystem  ──────────── Wallet اول
   ↓
S76–S96   PHASE 13 National Interoperability  ── Federation اول
   ↓
S97–S113  PHASE 14 Media Infrastructure
   ↓
S114–S139 PHASE 15 National Intelligence
   ↓
S140      G10 — NATIONAL GO GATE (بازگواهی مستقل زیروتراست)
```

---

## ۱۵. اسناد مرجع این بازسازی

| سند | نقشی که ایفا کرد |
|---|---|
| `docs/ROADMAP.md` | نقشهٔ مهندسی Waves + Production Readiness Gate + Anti-patterns + **تعاریف دامنهٔ W21-01..10 (§۳۴)، R-01..R-07 (§۳۵)، W22-01..10 (§۳۶) و §۳۷** — آن سند مرجع «چیستی» هر قابلیت است، این سند مرجع «کِی و با چه ترتیبی» |
| `docs/roadmaps/ROADMAP_V3_EDUCATIONAL_INTELLIGENCE.md` | ترتیب وابستگی آموزشی + DoD آموزشی + قواعد آماری/عدالت |
| `docs/NATIONAL_ROADMAP_PROGRESS.md` | وضعیت Owner/Risk/Dependency/Evidence هر Wave |
| `docs/NATIONAL_SCALE_FUTURE_UPGRADES_ADDENDUM.md` | ورودی تحقیقاتی ۸.۶/۸.۷/۸.۸/۹/۹.۲ |
| `docs/PHASE_8_ENTRY_AUDIT_REPORT.md` | رجیستر R1–R25 + سطوح شواهد E1–E4 + گیت‌های فاز ۸ |
| `docs/PHASE_8.1_REMEDIATION_AUDIT_REPORT.md` | وضعیت VERIFIED فعلی + باتری ۱۲۷/۱۲۷ |
| `PHASE6_FINAL_ZERO_TRUST_RED_TEAM_VERDICT.md` (@ `046dafd4`) | مدرک ردِ فاز ۶ — مبنای تنزل وضعیت‌ها |
| `docs/ARCHITECTURE/PHASE_6_FINAL_GO_LIVE_REPORT.md` | ادعای «۱۰۰٪» که این سند آن را باطل ثبت کرد |
| `docs/EXECUTION_CONTROL_PROTOCOL.md` · `DAILY_20_MISSION_PROTOCOL.md` · `PARALLEL_FAILOVER_EXECUTION_PROTOCOL.md` · `ARENA_EXECUTION_MODEL.md` | مدل اجرای موازی/failover که ماتریس بخش ۱۳ با آن سازگار شد |
| `docs/MASTER_PROJECT_HANDOVER_PROMPT.md` · `ARENA_AGENT_PROMPT.md` | قرارداد بازیابی — این سند به‌عنوان مرجع برنامه به آن وصل است |
| `migrations/001…020` | اثبات زنجیرهٔ مهاجرت + تأیید نبود `schema_migrations` (R21) |
| `skills/evidence-integrity-and-commit-accounting` | قواعد G0 و سطوح شواهد |

---

## ۱۶. حکم این بازسازی

```
╔══════════════════════════════════════════════════════════════════════════╗
║                                                                          ║
║   ROADMAP RECONSTRUCTION — FINAL STATUS                                  ║
║                                                                          ║
║   Historical Timeline (Phase 1 → 8.1) : بازسازی‌شده از Git — VERIFIED     ║
║   Current State                       : ثبت‌شده بدون Greenwashing         ║
║   Future Schedule (S1 → S140)         : PLANNING ESTIMATE — PLANNED      ║
║   Dependency Graph                    : اصلاح‌شده بر پایهٔ شواهد مخزن      ║
║   Parallelization Matrix              : SERIAL/PARALLEL مستدل            ║
║   Gate Model (G0–G10)                 : تعریف‌شده و به فازها نگاشت شد     ║
║   Research-only Track (RS-1…RS-7)     : RESEARCH — ورود ممنوع            ║
║   National Platform Foundation Track  : ۲۶ ردیف، cross-link شده          ║
║   Risk / Blocker Register             : ۱۲ ریسک، ۱ BLOCKER فعال          ║
║                                                                          ║
║   فازهای «۱۰۰٪» که به وضعیت واقعی تنزل یافتند : Phase 5 Steps 08–12،      ║
║   Phase 6 (cutover ملی)، P2-NI-02 (NOC)، P0-EI-21 (گواهی)               ║
║                                                                          ║
╚══════════════════════════════════════════════════════════════════════════╝
```


## 0.4 الحاق Red-Team Chat 5 — 2026-09-21

Chat 5 روی HEAD 138cd1d9 گزارش مستقل runtime/CI ارائه کرده است. **S2=VERIFIED (delivered/truthfully labeled)** ولی **Phase 8.2 Exit=NOT VERIFIED**.

| Work item | Evidence required | Status | Gate |
|---|---|---|---|
| M1 / S3 | receiver واقعی، fault injection، alert→ack→runbook→recovery، timestamp، MTTA/MTTR | NOT VERIFIED | BLOCKING |
| M2 / S4 PG | restore/promote معادل تولید، T1-T7، identity/checksum، RPO/RTO | NOT VERIFIED (E3 partial) | BLOCKING |
| M3 / S4 Redis | restore/failover و verification رفتار revocation/rate-limit | NOT VERIFIED (E3 restart only) | BLOCKING |
| M0 | redis.init bootstrap در session-revocation | P3 | Non-blocking |
| M5 | اصلاح stub verification report | P3 | بعد از M1-M3 |

**Execution order:** M0 → M1 → M2 → M3 → M5 → Gate 8.2 VERIFIED → Phase 8.3.

**Evidence rule:** E3 isolated restore، وجود config/runbook، یا TARGET/POLICY metrics به‌تنهایی برای عبور E4 کافی نیستند. National load testing در sandbox ممنوع و به Phase 8.3 staging production-equivalent موکول است.

مرجع: docs/audit/CHAT5_PHASE8_2_DELTA_2026-09-21.md.


### ۰.۵ تصحیح و تطبیق Chat 2 با شواهد بعدی — 2026-09-21

گزارش Chat 2 یک ورودی تاریخی ارزشمند است، اما چهار finding آن اکنون وضعیت متفاوتی دارند:

- RT2-01: وجود `max-allowed-issues: 2147483647` در Codacy تأیید پیکربندی است؛ اثر «همیشه سبز» به‌عنوان واقعیت runtime پذیرفته نمی‌شود. یافته‌های Chat 4، failureهای tool/config را نشان می‌دهد و آن را blocker مستقیم نمی‌داند. پیگیری به‌عنوان security-gate governance باقی می‌ماند.
- RT2-02: مسیر کد دو فراخوانی tenant-policy را دارد؛ عدد 40k QPS در 20k RPS هنوز extrapolation است. instrumentation/query-count measurement قبل از remediation الزامی است.
- RT2-03: شواهد بعدی E3 برای restore واقعی وجود دارد، اما E4 production-equivalent restore/promote و RPO/RTO اندازه‌گیری‌شده هنوز برای Gate 8.2 لازم است؛ بنابراین به M2 متصل می‌ماند.
- RT2-04: ادعای blind spot ناشی از `monitoring/alert-rules.yaml` اصلاح/پس گرفته شد؛ `monitoring/alert-rules.yml` symlink است و Prometheus هر دو `alert-rules.yml` و `alerts.yml` را load می‌کند. orphan yaml فقط drift/cleanup است.

**ترتیب اجرایی اصلاح‌شده:**
```
M1 live alert/on-call/recovery E4
M2 PG restore/promote + Redis E4 + measured RPO/RTO
M3 R6/R7 + revocation/cold-cache evidence
RT2-02 query measurement / remediation before empirical 8.3 capacity claims
Gate 8.2 VERIFIED
↓
Phase 8.3 E4 provisioning → empirical load/soak
```

مرجع: `docs/audit/CHAT2_PHASE8_2_RECONCILIATION_2026-09-21.md`.


### ۰.۶ الحاق Red-Team Chat 3 — Architecture/Data Integrity Reconciliation (2026-09-21)

گزارش Chat 3 روی SHA تاریخی `138cd1d9b03278fcf15c6476faa497fe89d275af` بررسی شد. یافته‌های آن به‌جای پذیرش کور، با شواهد بعدی و کد/اسناد موجود تفکیک شدند.

**کارهای اجباری جدید/تقویت‌شده:**
1. **OUTBOX-002:** اجرای آزمون دو ورکر همزمان روی PostgreSQL زنده برای اثبات انحصار claim/lock در `fetchPendingBatch`. وجود `SKIP LOCKED` در متن SQL به‌تنهایی کافی نیست.
2. **DB-001:** instrumentation برای تعداد query/request و latency واقعی مسیر authenticated؛ عددهای 40k QPS و p95 گزارش Chat 3 صرفاً extrapolation هستند تا اندازه‌گیری شوند.
3. **OUTBOX-001:** پیش از هر ادعای 25k events/s، قرارداد event coverage برای mutationهای Sync و delete/tombstone باید صریح و آزمون‌پذیر شود.
4. **MIG-001:** crash-window بین اجرای `psql` و ثبت `schema_migrations` به backlog hardening اضافه می‌شود؛ blocker مستقل Gate 8.2 نیست.

**مواردی که blocker جدید نیستند:** ARCH-001 با hydration guards/caps قبلی تا حدی superseded است و فقط E4 cold-boot measurement می‌خواهد؛ R6/Redis fail-open و DR/Alerting قبلاً در M1/M2/M3 مدیریت شده‌اند.

**ترتیب اجرایی:**
M1 live alert/on-call/recovery → M2 PG restore/promote + Redis E4 → M3 R6/R7/cold-cache → OUTBOX-002 reproduction + DB-001 measurement → Gate 8.2 VERIFIED → Phase 8.3 empirical scale.

مرجع تفصیلی: `docs/audit/CHAT3_PHASE8_2_RECONCILIATION_2026-09-21.md`.


## ۰.۷ الحاق Red-Team Chat 4 — QA / Release / Reproducibility Reconciliation (2026-09-21)

Chat 4 مستقل از گزارش‌های قبلی، لایه QA/Release/CI/CD را روی baseline `fe633395` ممیزی کرده است. مرجع تفصیلی: `docs/audit/CHAT4_QA_RELEASE_RECONCILIATION_2026-09-21.md`.

### قرارداد اجرایی جدید

1. **F-QA-02 / Evidence Integrity — P0:** گزارش `PHASE_8_2_FINAL_VERIFICATION_REPORT.md` که VERIFIED اعلام می‌کند، تا وقتی SHA/run_id/count/raw-output معتبر نداشته باشد Evidence Exit محسوب نمی‌شود و باید بازنویسی/ابطال شود.
2. **F-QA-03 / CI Determinism — P1:** boot timeout در GATE 3 باید رفع یا adaptive/pre-seeded شود و سپس حداقل ۲۰ اجرای قابل مشاهده برای pass-rate/تکرارپذیری ثبت شود.
3. **F-QA-01 / Tag Integrity — P1:** پس از پایدار شدن CI، tag `phase8.2-verified` باید به SHA دارای Node.js CI سبز متصل شود یا نام آن به non-gate/report tag تغییر کند.
4. **F-QA-08 / Backup Fake-Green — P1:** `tools/redis-backup.sh` نباید در flock contention با exit 0 موفقیت کاذب بدهد؛ این مورد پیش‌نیاز S4 است.
5. **F-QA-05 / Reproducibility — P2:** Node ≥22 و مسیر CI-parity برای حدود ۵۱۸ تست خارج از `npm test` مستند شود.
6. **F-QA-04/F-QA-06/F-QA-07:** scanner config/credentials، Redis step naming و version/tag/changelog به backlog Release Governance منتقل شوند؛ این موارد به‌خودی‌خود Gate 8.2 را باز نمی‌کنند.
7. **F-QA-10:** finding قبلی درباره چهار فایل alert و silent-alert risk رسماً withdrawn است؛ `monitoring/alert-rules.yml` symlink است و Prometheus هر دو rule file مورد نظر را load می‌کند.

### ترتیب اجرایی اصلاح‌شده

```
F-QA-02
  → F-QA-03
  → F-QA-01
  → F-QA-08
  → M1
  → M2/M3
  → OUTBOX-002 + DB-001 + OUTBOX-001
  → Gate 8.2 VERIFIED
  → Phase 8.3 E4 staging / empirical load
```

### وضعیت گیت‌ها

- Phase 8.2 Exit: **NOT VERIFIED**
- G8.3-IN / G8.3-OUT: **NOT VERIFIED**
- Phase 8.3 empirical capacity: **NONE**
- Production GO: **NOT DECLARED**

Chat 4 همچنین تأیید می‌کند که build/test substrate روی Node 22 قابل بازتولید است، اما local green معادل repository-wide green نیست؛ `npm test` فقط دو suite را سیم‌کشی می‌کند و اجرای جامع عمدتاً در CI است. این موضوع به‌عنوان Reproducibility follow-up ثبت می‌شود، نه به‌عنوان fake-green.
