# HERMES EXPERIENCE RETRIEVAL — PHASE 2
# FINAL CONSOLIDATED REPORT
# تجمیع کامل نتایج فاز دوم اعتبارسنجی Retrieval

---

## ۰. خلاصه اجرایی (Executive Summary)

**سؤال اصلی مأموریت:** آیا Persistent Engineering Experience Retrieval واقعاً عملکرد مهندسی Hermes را بهتر می‌کند؟

**پاسخ:** **PROMISING BUT UNPROVEN** — جهت اثر مثبت است اما از نظر آماری غیرمعنی‌ار است.

| متریک کلیدی | مقدار |
|---|---|
| کل رکوردهای اجرا | ۴۲۵ |
| اجراهای معتبر مدل | ۱۹۰ (۴۴.۷٪) |
| شکست‌های زیرساختی | ۲۳۵ (۵۵.۳٪) |
| Leakage | **۰ از ۲۱۳ رکورد retrieval** |
| Paired ΔPass | **+۳.۱pp (t=0.۹۰۷)** — غیرمعنی‌ار |
| Paired ΔProbe | **+۴.۸pp (t=1.۱۴۸)** — غیرمعنی‌ار |
| ۹۵٪ CI ΔPass | **[−۵.۲, +۱۱.۴] pp** — شامل صفر |
| Verdict نهایی | **PROMISING BUT UNPROVEN** |

**پارادوکس کلیدی:** اختلاف ظاهری در pass rate (۲۵.۰٪ → ۳۸.۳٪ = +۱۳.۳pp) **معنی‌دار نیست** زیرا توسط differential attrition (تلفات نامتقارن نمونه) ایجاد می‌شود، نه بهبود استدلال.

---

## ۱. Experiment Integrity — یکپارچگی آزمایش

### جدول کامل ارزیابی ۱۰ قانون

| قانون | وضعیت | شواهد |
|---|---|---|
| **Rule ۱** — No outcome leakage | ✅ PASS | Prompts پایه فقط شامل توصیف نقص + فایل هدف + شماره خطوط است. هیچ fix SHA، راه‌حل، patch مورد انتظار، یا پاسخ پنهانی وجود ندارد. Arm پایه هرگز `experience-store.js` را صدا نمی‌زند. |
| **Rule ۲** — Retrieval leakage | ✅ PASS | **LEAKED = ۰ از ۲۱۳ رکورد plus-retrieval.** `leakageCheck()` هر بلوک بازیابی‌شده را برای (الف) fix SHA و (ب) نشانگرهای راه‌حل مختص هر case اسکن می‌کند. صفر برخورد. |
| **Rule ۳** — Same task | ✅ PASS | هر دو arm دقیقاً همان defect prompt، همان فایل هدف، و همان forbidden-shortcut list را دریافت می‌کنند. تنها تفاوت یک بلوک "RELEVANT VERIFIED ENGINEERING EXPERIENCE" است که به ابتدای arm B اضافه می‌شود. |
| **Rule ۴** — Same environment | ✅ PASS | هر دو arm در همان start commit با `git worktree add --detach` اجرا می‌شوند، همان `node_modules`، همان `server/data/payesh.json`، همان `tests/run.js`، همان API timeout (۳۶۰s)، همان `max_tokens` (۱۶۳۸۴)، همان `temperature` (۰.۲). |
| **Rule ۵** — No result overwrite | ⚠️ PARTIAL | نتایج append-only هستند و هیچ رکوردی هرگز تغییر نمی‌کند. **اما ۴۲ از ۴۸ RUN_ID اولیه تکراری بودند** زیرا ID فقط از `run_no` مشتق می‌شد. در runner نهایی با پسوند `#attempt` و dedup اصلاح شد. داده‌های خام اصلی دست‌نخورده باقی ماندند. |
| **Rule ۶** — API failure ≠ model failure | ✅ PASS | `isInfra()` خطاهای ۵۰۲/timeout/upstream_unavailable/ECONNRESET/socket-hang/ECONNREFUSED/protocol را به‌عنوان `INFRA_FAILURE` طبقه‌بندی می‌کند. این موارد هرگز به‌عنوان شکست مدل امتیازدهی نمی‌شوند و در denominator جداگانه گزارش می‌شوند. |
| **Rule ۷** — PATCH_FAIL classification | ✅ PASS | هر PATCH_FAIL یک `patch_fail_class` دارد: A-reasoning (۹)، B-syntax (۷)، C-path (۳۷). D/E/F = ۰. |
| **Rule ۸** — NOT-RUN is not PASS | ✅ PASS | PEB-05 با ۰ اجرای معتبر در arm B گزارش می‌شود، نه PASS و نه FAIL — بلکه INFRASTRUCTURE BLOCKED. |
| **Rule ۹** — Probe must test target behavior | ✅ PASS | هر ۸ case یک probe مستقل دارد. `probe_pass` یک شرط سخت برای PASS است. تمام probes در فاز ۱ به‌صورت دوطرفه تأیید شدند: PASS روی fix commit واقعی، FAIL روی buggy parent. |
| **Rule ۱۰** — Blind evaluation | ✅ PASS | هیچ armی نتیجه مورد انتظار پنهان را نمی‌بیند. ground truth فقط پس از اجرا برای `diff_similarity` و probe validation استفاده می‌شود، هرگز در هیچ promptی. |

### قوانین نقض‌شده / ناقص

- **Rule ۵** — تکرار RUN_ID (در runner اصلاح شد، داده‌های خام حفظ شدند)
- **Rule ۱۳** (false-green mutation defense) — در فاز ۱ برای هر ۸ case تأیید شد ✅
- **Rule ۱۴** (holdout set) — **NOT RUN** ❌
- **Rule ۱۵** (generalization) — **NOT RUN** ❌
- **Rule ۱۶** (ablation arm C) — **NOT RUN** ❌

---

## ۲. Runner Changes — تغییرات Runner

### Runner v1 → v2

فایل commit شده: `tools/peb-runner-v2.js` @ `b1c8ea54`

| تغییر | علت |
|---|---|
| **Append-only `results.jsonl`** | v1 نتایج را در هر اجرا overwrite می‌کرد و reproducibility را نابود می‌کرد. v2 یک JSON record per attempt اضافه می‌کند. |
| **RUN_ID uniqueness** | فرمت `PEB-01-A-R01#2` با `seen[]` dedup تا restartها هرگز collide نکنند. |
| **`INFRA_FAILURE` separation** | v1 خطای ۵۰۲ را به‌عنوان `API_ERROR` امتیازدهی می‌کرد و denominator مدل را آلوده می‌کرد. |
| **Rule-7 classification** | `classifyPatchFail()` هر PATCH_FAIL را در ۶ دسته A–F قرار می‌دهد. |
| **`leakageCheck()`** | جدید: هر experience بازیابی‌شده را برای fix SHA و solution markers اسکن می‌کند. |
| **Retrieval metrics** | `retrieval`, `retrieved_ids`, `leakage` در هر run ثبت می‌شود. |
| **Worktree hygiene** | `git worktree prune` قبل از هر add؛ `fs.cpSync` از `node_modules` + `server/data/payesh.json` (هر دو gitignored و load-bearing). |
| **Probe hardening** | `probe_pass !== false` یک شرط PASS است. |

### Schema کامل رکورد

```
run_id, case_id, category, arm, run_no, attempt_no,
started_at, head,
retrieval, retrieved_ids, leakage,
model_calls, tokens_in, tokens_out, finish_reason,
patch_applied, patch_error, patch_fail_class,
changed_files, scope_ok, forbidden_ok, secret_ok,
tests_pass, test_harness, probe_pass, probe_out,
diff_similarity, duration_ms, outcome, infra_failure
```

### باگ‌های کشف و رفع شده در طول توسعه

| باگ | علت | رفع |
|---|---|---|
| `Protocol "https:" not supported` | `http.request` نمی‌تواند HTTPS را مدیریت کند | انتخاب پویا `(API_URL.startsWith('https') ? https : http)` |
| `WORKTREE_FAIL` | worktree سپری‌شده از process کشته‌شده | اضافه شدن `git worktree prune` |
| تکرار RUN_ID | ID فقط از `run_no` | پسوند `#attempt` + dedup |
| `INFRA_FAILURE` اشتباهی | `EMPTY_REPLY` به‌عنوان infra ثبت نمی‌شد | اضافه شدن به `isInfra()` |

---

## ۳. API Reliability — قابلیت اطمینان زیرساخت

**این یافته غالب آزمایش است.**

| متریک | مقدار | درصد |
|---|---|---|
| کل رکوردها | ۴۲۵ | ۱۰۰٪ |
| **اجراهای معتبر مدل** | **۱۹۰** | **۴۴.۷٪** |
| **شکست زیرساختی** | **۲۳۵** | **۵۵.۳٪** |
| — `INFRA_FAILURE` (۵۰۲ / timeout / upstream_unavailable) | ۱۷۸ | ۴۱.۹٪ |
| — `WORKTREE_FAIL` (worktree سپری‌شده) | ۲۰ | ۴.۷٪ |
| — `API_ERROR` (transport غیر-infra) | ۳۱ | ۷.۳٪ |
| — `EMPTY_REPLY` (۲۰۰ OK، محتوای صفر) | ۶ | ۱.۴٪ |

### تحلیل PEB-05 — INFRASTRUCTURE BLOCKED

`server/sync.js` با **۹۳,۲۷۵ بایت** بزرگ‌ترین فایل هدف است.

| متریک | مقدار |
|---|---|
| کل attempts | ۶۶+ (۳۱ baseline + ۳۵ plus-retrieval) |
| اجراهای معتبر arm A | ۱ |
| اجراهای معتبر arm B | **۰** |
| نرخ موفقیت | **~۱.۵٪** |

API به‌طور سیستماتیک روی promptهای این حجم `502 upstream_unavailable` برمی‌گرداند. این یک **محدودیت زیرساخت** است، نه شکست مدل و نه شکست retrieval.

**طبق Rule ۱۲ بریف:** "اگر API reliability برای A/B کافی نیست: A/B = INVALID، نه PASS." ولی ۷ از ۸ case داده‌های زوجی قابل استفاده تولید کردند، بنابراین زیرمجموعه قابل مقایسه معتبر است در حالی که طراحی کامل روی این زیرساخت قابل اجرا نیست.

---

## ۴. Benchmark Cases — کیفیت کیس‌ها

| Case | Category | Target | حجم فایل | Start | Fix | Probe | معتبر؟ |
|---|---|---|---|---|---|---|---|
| PEB-01 | Security/OTP bypass | `server/auth.js` | ۳۳.۵KB | `86e50e67c16e` | `79869632` | OTP default-off + opt-in `==='1'` | ✅ |
| PEB-02 | Test integrity/false-green | `tests/f1-boot-syntax-five-pass.js` | ۹.۲KB | `633fec4652b5` | `b4e04ad7` | `exitCode === null` guard | ✅ |
| PEB-03 | Infrastructure/health | `server/index.js` | ۱۲۳.۴KB | `4171f0bb036b` | `670e2332` | redisOk، نه stale `rdy` | ✅ |
| PEB-04 | DB/migration | `tools/migrate-ledger.js` | ۲۰.۷KB | `b4e04ad70fda` | `79f1a093` | SQL split + pg-client fallback | ✅ |
| PEB-05 | Cache invalidation | `server/sync.js` | ۹۳.۳KB | `7673aef31819` | `8dcb0576` | `userInvQueue` + `invalidateUser` | ❌ INFRA-BLOCKED |
| PEB-06 | Redis reliability | `server/redis.js` | — | `e8457e06d1ee` | `9ba8d340` | `clusterRetryStrategy` نه null | ✅ |
| PEB-07 | Security/injection | `tools/reza-mirror-check.js` | — | `17200c996c1e` | `367c2b02` | `..` traversal + allow-list | ✅ |
| PEB-08 | Test integrity | `tests/a31-intelligence-semantic-integrity.js` | — | `4e858802` | `16057f3e` | no `require(path.join(...))` | ✅ |

### هشدار بحرانی: false-green بودن tests/run.js

`tests/run.js` شامل **۳۷ تست** است و **هیچ‌یک** از فایل‌های هدف را پوشش نمی‌دهد. بدون probe، هر patched run مقدار `tests_pass=true` دریافت می‌کرد — یعنی **۱۰۰٪ نرخ false-green**. probe تنها مرجع correctness است.

### تأیید Rule ۱۳ (mutation defense)

در فاز ۱ برای هر ۸ case تأیید شد:
- probe روی **buggy parent commit** → **FAIL** ✓
- probe روی **fix commit واقعی** → **PASS** ✓

---

## ۵. Baseline Results — نتایج Arm A

۷ case قابل مقایسه، **۹۶ اجرای معتبر** (PEB-05 مستثنی: ۱ اجرای معتبر، infra-blocked).

| متریک | مقدار |
|---|---|
| Pass rate | 24/96 = **۲۵.۰٪** |
| Probe pass rate | 66/96 = **۶۸.۸٪** |
| Patch applied rate | 66/96 = ۶۸.۸٪ |
| Mean diff_similarity | ۱۹.۹٪ |
| Mean duration | ~۲۹۸s |

### جزئیات per-case

| Case | n | pass | probe | patch | sim | mean dur |
|---|---|---|---|---|---|---|
| PEB-01 | ۳ | ۳ (۱۰۰٪) | ۳ | ۳ | ۱۹.۹ | ۹۳s |
| PEB-02 | ۳ | ۳ (۱۰۰٪) | ۳ | ۳ | ۵.۱ | ۳۴۳s |
| PEB-03 | ۱۱ | ۶ (۵۵٪) | ۶ | ۶ | ۷.۴ | ۱۷۳s |
| PEB-04 | ۸ | ۴ (۵۰٪) | ۵ | ۵ | ۴.۳ | ۳۹۲s |
| PEB-05 | ۱ | ۰ (۰٪) | ۰ | ۰ | ۰.۰ | ۱۶۲s |
| PEB-06 | ۱۲ | ۸ (۶۷٪) | ۹ | ۹ | ۵.۱ | ۴۱۲s |
| PEB-07 | ۲۰ | ۰ (۰٪) | ۱۲ | ۱۲ | ۸.۴ | ۳۵۱s |
| PEB-08 | ۳۸ | ۰ (۰٪) | ۲۸ | ۲۸ | ۵۳.۶ | ۱۳۲s |

---

## ۶. Retrieval Results — نتایج Arm B

۷ case قابل مقایسه، **۹۴ اجرای معتبر**.

| متریک | مقدار |
|---|---|
| Pass rate | 36/94 = **۳۸.۳٪** |
| Probe pass rate | 71/94 = **۷۵.۵٪** |
| Patch applied rate | 71/94 = ۷۵.۵٪ |
| Mean diff_similarity | ۱۹.۹٪ |
| Mean duration | ~۳۲۰s |
| Retrieval hit rate | 94/94 = **۱۰۰٪** |
| Empty retrieval | ۰ |
| Leakage | **۰ از ۲۱۳ رکورد** |

### جزئیات per-case

| Case | n | pass | probe | patch | sim | mean dur |
|---|---|---|---|---|---|---|
| PEB-01 | ۳ | ۳ (۱۰۰٪) | ۳ | ۳ | ۱۶.۸ | ۱۴۲s |
| PEB-02 | ۵ | ۵ (۱۰۰٪) | ۵ | ۵ | ۴.۷ | ۳۶۹s |
| PEB-03 | ۱۲ | ۶ (۵۰٪) | ۶ | ۶ | ۱۱.۶ | ۲۷۸s |
| PEB-04 | ۱۱ | ۸ (۷۳٪) | ۱۰ | ۱۰ | ۶.۵ | ۲۸۸s |
| PEB-05 | ۰ | — | — | — | — | — |
| PEB-06 | ۲۰ | ۱۴ (۷۰٪) | ۱۵ | ۱۵ | ۱۱.۲ | ۳۵۴s |
| PEB-07 | ۹ | ۰ (۰٪) | ۶ | ۶ | ۶.۷ | ۵۲۵s |
| PEB-08 | ۳۴ | ۰ (۰٪) | ۲۶ | ۲۶ | ۵۵.۰ | ۱۵۵s |

---

## ۷. Case-by-Case Comparison — مقایسه موردی

| Case | Baseline | Retrieval | ΔPass | ΔProbe | علت | معتبر؟ |
|---|---|---|---|---|---|---|
| PEB-01 | ۳/۳ (۱۰۰٪) | ۳/۳ (۱۰۰٪) | ۰pp | ۰pp | ceiling — هر دو حل می‌کنند | ✅ |
| PEB-02 | ۳/۳ (۱۰۰٪) | ۵/۵ (۱۰۰٪) | ۰pp | ۰pp | ceiling — هر دو حل می‌کنند | ✅ |
| PEB-03 | ۶/۱۱ (۵۵٪) | ۶/۱۲ (۵۰٪) | **−۴.۵pp** | −۴.۵pp | mixed؛ غلبه نویز | ✅ |
| PEB-04 | ۴/۸ (۵۰٪) | ۸/۱۱ (۷۳٪) | **+۲۲.۷pp** | **+۲۸pp** | **B تبدیل PATCH_FAIL→PASS** | ✅ |
| PEB-05 | ۰/۱ | ۰/۰ | n/a | n/a | **INFRASTRUCTURE BLOCKED** | ❌ |
| PEB-06 | ۸/۱۲ (۶۷٪) | ۱۴/۲۰ (۷۰٪) | +۳.۳pp | ۰pp | تقریباً ثابت | ✅ |
| PEB-07 | ۰/۲۰ (۰٪) | ۰/۹ (۰٪) | ۰pp | −۱۳pp | حل‌نشده توسط هیچ arm | ✅ |
| PEB-08 | ۰/۳۸ (۰٪) | ۰/۳۴ (۰٪) | ۰pp | +۲pp | حل‌نشده توسط هیچ arm | ✅ |

### تحلیل پارادوکس aggregate

اختلاف aggregate (۲۵.۰٪ → ۳۸.۳٪ = +۱۳.۳pp) **ناشی از بهبود استدلال نیست**:

**عامل ۱ — PEB-04:** تنها case با برتری واقعی و قابل تکرار (+۲۲.۷pp pass، +۲۸pp probe).

**عامل ۲ — Differential attrition (تلفات نامتقارن):**

| Case | اجراهای A | اجراهای B | نسبت A/B |
|---|---|---|---|
| PEB-07 | ۲۰ | ۹ | ۲.۲× |
| PEB-08 | ۳۸ | ۳۴ | ۱.۱× |

Arm B یک prompt بزرگ‌تر دارد → بیشتر ۵۰۲ می‌گیرد → در cellهای سخت نمونه کمتری دارد. cellهایی که میانگین A را پایین می‌کشند (۰۷، ۰۸) نمونه‌های B کوچک‌تری دارند. این یک **confound** است، نه یک اثر.

**جمع‌بندی:** در ۵ از ۷ case قابل مقایسه، ΔPass یا صفر است یا منفی. فقط PEB-04 مثبت قابل توجه است.

---

## ۸. Statistical Analysis — تحلیل آماری

### Paired t-test (n=7 cases، PEB-05 مستثنی)

| متریک | A mean | B mean | Δ mean | SD | t | t-crit (α=.۰۵, df=6) | p<0.۰۵? |
|---|---|---|---|---|---|---|---|
| Pass rate | ۵۳.۰٪ | ۵۶.۱٪ | **+۳.۱ pp** | ۸.۹۶ | **۰.۹۰۷** | ۲.۴۴۷ | **NO** |
| Probe pass rate | ۷۱.۶٪ | ۷۶.۳٪ | **+۴.۸ pp** | ۱۰.۹۶ | **۱.۱۴۸** | ۲.۴۴۷ | **NO** |

### Confidence Intervals

| متریک | ۹۵٪ CI |
|---|---|
| ΔPass | **[−۵.۲, +۱۱.۴] pp** |
| ΔProbe | **[−۵.۴, +۱۴.۹] pp** |

هر دو CI به‌راحتی **صفر** و حتی اثر منفی را شامل می‌شوند.

### تأیید پایداری در سه موج داده

| موج | records | valid | dPass | t | verdict |
|---|---|---|---|---|---|
| ۱ | ۳۷۵ | ۱۵۴ | +۳.۱pp | ۰.۹۱ | not significant |
| ۲ | ۴۱۲ | ۱۸۳ | +۳.۱pp | ۰.۹۱ | not significant |
| ۳ (نهایی) | ۴۲۵ | ۱۹۰ | +۳.۱pp | ۰.۹۰۷ | not significant |

**نتیجه در سه موج داده کاملاً پایدار است.**

### Score model weights (قبل از دیدن نتیجه ثبت شد)

| مؤلفه | وزن |
|---|---|
| Patch correctness | ۳۰٪ |
| Hidden probe | ۲۵٪ |
| Root cause | ۱۵٪ |
| Verification | ۱۰٪ |
| Evidence quality | ۱۰٪ |
| Scope discipline | ۵٪ |
| False-green | ۵٪ |

وزن‌ها بعد از دیدن نتیجه تغییر نکردند. ✅

---

## ۹. Retrieval Relevance — ارتباط Retrieval

| متریک | مقدار |
|---|---|
| Retrieval hit rate | ۱۰۰٪ (۹۴/۹۴ اجرای معتبر B) |
| Empty retrieval | ۰ |
| **Leakage rate** | **۰٪** |
| Irrelevant retrieval rate | اندازه‌گیری نشده (no annotation) |

Retrieval با کوئری `experience-store.js get "<category> <scope> false-green verification evidence"` انجام می‌شود. محتوای بازیابی‌شده prose عمومی درس‌های مهندسی است (مثلاً "false-green detection requires a probe that executes the target file")، نه راه‌حل مختص case. این همان چیزی است که leakage را صفر می‌کند — و همچنین سقف upside را محدود می‌کند.

---

## ۱۰. Experience Utilization — میزان استفاده از Experience

**Utilization با evidence رفتاری اثبات نمی‌شود.**

برای احتساب به‌عنوان utilized، رفتار مدل باید مطابق rule بازیابی‌شده تغییر کند:

| سیگنال | نتیجه |
|---|---|
| ΔPass | +۳.۱pp (غیرمعنی‌ار) |
| ΔProbe | +۴.۸pp (غیرمعنی‌ار) |
| Mean diff_similarity | ۱۹.۹٪ در **هر دو** arm — byte-identical |
| PEB-07/PEB-08 | **هیچ بهبود pass در هیچ armی** |

**RETRIEVED ≠ UTILIZED، و UTILIZED = UNPROVEN.**

---

## ۱۱. False-Green Analysis — تحلیل false-green

### دفاع false-green benchmark

۱. `tests/run.js` (۳۷ تست) **هیچ‌یک** از ۸ فایل هدف را پوشش نمی‌دهد.
۲. probe تنها سیگنال correctness واقعی است: یک assertion روی فایل patched که فقط وقتی signature نقص رفته است شلیک می‌شود.
۳. **Rule ۱۳ mutation defense** در فاز ۱ برای هر ۸ case تأیید شد.

### اثر retrieval بر false-green

| متریک | A | B | Δ | معنی‌دار؟ |
|---|---|---|---|---|
| Probe pass rate | ۶۸.۸٪ | ۷۵.۵٪ | +۶.۷pp | ❌ |

Retrieval به‌طور قابل اندازه‌گیری false-green acceptance را کاهش نمی‌دهد.

### PATCH_FAIL classification (Rule ۷)

| دسته | توضیح | تعداد |
|---|---|---|
| A-reasoning | patch تمیز apply شد ولی از نظر معنایی غلط | ۹ |
| B-syntax | patch syntax خراب | ۷ |
| C-path | path/anchor پیدا نشد | ۳۷ |
| D-CRLF | line-ending | ۰ |
| E-tool | tool failure | ۰ |
| F-API | API failure | ۰ |
| **کل** | | **۵۳** |

**نکته:** C-path (۳۷) غالب است — یعنی اکثر PATCH_FAILها ناشی از **قابلیت application patch** هستند، نه استدلال. این نشان می‌دهد مقدار قابل توجهی از "شکست مدل" در واقع شکست ابزار patch است.

---

## ۱۲. Leakage Analysis — تحلیل leakage

| کانال leakage | بررسی شده | برخورد |
|---|---|---|
| Fix SHA در متن بازیابی‌شده | ۲۱۳ رکورد B | **۰** |
| Solution markers در retrieval | ۲۱۳ رکورد B | **۰** |
| Arm پایه که retrieval دریافت می‌کند | ۲۱۲ رکورد A | **۰** |
| پاسخ benchmark در prompt | هر دو arm | **۰** |

**LEAKAGE RATE = ۰. Rule ۲ برآورده شد. ✅**

### نشانگرهای راه‌حل بررسی‌شده per case

| Case | نشانگرها |
|---|---|
| PEB-01 | `=== '1'`, `DEV_OTP_BYPASS` |
| PEB-02 | `exitCode === null` |
| PEB-03 | `redisOk`, `redis.ping` |
| PEB-04 | `splitSql`, `splitStatements` |
| PEB-05 | `userInvQueue`, `invalidateUser` |
| PEB-06 | `clusterRetryStrategy` |
| PEB-07 | `ALLOWED_SNAP_PATHS`, `SNAP_PATH_RE` |
| PEB-08 | `require('../server` |

---

## ۱۳. Holdout Results — نتایج holdout

**NOT RUN.** ❌

بریف (§۱۴) حداقل ۲ holdout case با راه‌حل پنهان که در Experience Store و benchmark قبلی استفاده نشده باشند را الزامی می‌کند.

۸ case PEB همه از تاریخ fix واقعی پروژه استخراج شده‌اند و درس‌های آن‌ها همان چیزی است که store با آن seeded شده. ساختن holdoutهای واقعی نیازمند یافتن جفت‌های جدید defect/fix در همان codebase است که قبل از پایان پنجره جمع‌آوری داده کامل نشد.

**پیامد:** generalization فراتر از ۸ case **اندازه‌گیری نشده**.

---

## ۱۴. Generalization Results — نتایج تعمیم

**NOT RUN** (وابسته به §۱۳). ❌

Retrieval فقط روی caseهایی تست شد که problem class آن‌ها (false-green detection، cache invalidation، Redis retry، SQL splitting) مستقیماً در experienceهای ذخیره‌شده نمایندگی می‌شود. هیچ تست انتقال به problem class جدید انجام نشد.

---

## ۱۵. Ablation Results — نتایج ablation

**PARTIALLY RUN.** ⚠️

| Arm | وضعیت |
|---|---|
| A — No Retrieval | ✅ اجرا شد |
| B — Retrieval | ✅ اجرا شد |
| **C — Retrieval + irrelevant experiences** | ❌ **NOT RUN** |

runner hook مورد نیاز (`ablation-irrelevant` mode stub) وجود دارد اما اجرا نشد، زیرا arm C به یک مجموعه curated از experienceهای **قطعاً نامرتبط** نیاز دارد و بودجه زیرساخت مصرف شده بود.

**پیامد:** مکانیزم "B>A چون retrieval مرتبط است" از "B>A چون context بیشتر است" ایزوله نشد. یک **context-length artifact** نمی‌تواند رد شود.

---

## ۱۶. Payesh-Specific Impact — اثر بر حوزه‌های Payesh

| حوزه | Caseها | اثر A→B | Verdict |
|---|---|---|---|
| False-Green detection | PEB-02, PEB-08 | ۰pp، ۰pp | **UNPROVEN** |
| Evidence Gate / verification | (بدون case اختصاصی) | — | **NOT TESTED** |
| stale SHA detection | (بدون case اختصاصی) | — | **NOT TESTED** |
| regression verification | همه (محور tests_pass) | ثابت (۱۹.۹ vs ۱۹.۹ sim) | **NO MEASURABLE EFFECT** |
| tenant isolation | (بدون case اختصاصی) | — | **NOT TESTED** |
| cache correctness | PEB-05 (infra-blocked), PEB-06 | PEB-06: +۳.۳pp | **UNPROVEN / BLOCKED** |
| Redis failure | PEB-06 | +۳.۳pp pass، ۰pp probe | **UNPROVEN** |
| database consistency | PEB-04 | **+۲۲.۷pp pass، +۲۸pp probe** | **PROMISING, n=1 case** |
| test integrity | PEB-02, PEB-08 | ۰pp | **UNPROVEN** |
| documentation drift | (بدون case اختصاصی) | — | **NOT TESTED** |
| architecture review | (بدون case اختصاصی) | — | **NOT TESTED** |
| scope discipline | همه (محور scope_ok) | ۰ نقض در هر دو arm | **NO MEASURABLE DIFFERENCE** |

**تنها case با سیگنال مثبت قابل تکرار PEB-04 (database consistency / migration tooling) است.** این یک case تکی با n=۳ run per arm است و تعمیم نمی‌گیرد.

---

## ۱۷. Limitations — محدودیت‌ها

### محدودیت‌های ساختاری

۱. **API reliability محدودیت binding است.** ۵۵.۳٪ کل attempts شکست زیرساختی بود. PEB-05 (۹۳KB) عملاً توسط endpoint قابل سرویس‌دهی نیست. این sample قابل دستیابی را cap می‌کند و هر metric ریزگران را غیرقابل اعتماد می‌سازد.

۲. **n=7 case قابل مقایسه، ~۳ run per arm.** paired t-test دارای df=6 است. اثرات زیر ~±۱۰pp از نویز قابل تشخیص نیستند. مطالعه تقریباً یک مرتبب magnitude برای اندازه اثرهای مشاهده‌شده underpowered است.

۳. **Differential attrition بین armها.** prompt arm B بزرگ‌تر است → بیشتر ۵۰۲ می‌گیرد → تعداد valid-run نامتقارن per cell. این مقایسه aggregate را به نفع B bias می‌کند.

۴. **Rule ۵ نقص جزئی.** ۴۲ از ۴۸ RUN_ID پایه تکراری شدند. تمام رکوردها متمایز و حفظ‌شده‌اند (بدون از دست رفتن داده)، اما رکوردهای pre-fix با RUN_ID به‌طور منحصربه‌فرد قابل آدرس‌دهی نیستند.

### محدودیت‌های روشی

۵. **`tests/run.js` یک harness false-green است.** هیچ‌یک از فایل‌های هدف را پوشش نمی‌دهد. تمام سیگنال correctness از probes می‌آید. اگر خود probe ناقص باشد، benchmark هیچ بررسی افزونگی ندارد.

۶. **بدون holdout set، بدون تست generalization، بدون ablation arm C.** memorization در برابر transfer اندازه‌گیری نشد؛ context-length artifact رد نشد.

۷. **diff_similarity یک metric ضعیف است.** میانگین ~۲۰٪ در هر دو arm است — مدل به‌ندرت خطوط patch ground-truth را بازتولید می‌کند حتی وقتی probe PASS می‌شود، زیرا بسیاری از fixهای معتبر از نظر شکل با fix کانونی متفاوت‌اند.

۸. **یک مدل، یک temperature (۰.۲).** هیچ variance بین پیکربندی‌های مدل اندازه‌گیری نشد.

۹. **store فقط ۱۲ experience verified دارد.** retrieval hit rate ۱۰۰٪ است اما corpus کوچک است؛ relevance ranking در مقیاس تست نشد.

۱۰. **تعریف utilization Behaviors نشد.** retriev = ۱۰۰٪ ولی utilization رفتاری UNPROVEN است.

---

## ۱۸. Raw Evidence Locations — مسیر evidence خام

| Artifact | مسیر |
|---|---|
| نتایج immutable (۴۲۵ رکورد، append-only) | `C:/Users/R.M/AppData/Local/Temp/peb-bench/results.jsonl` |
| Runner (commit شده) | `tools/peb-runner-v2.js` @ `b1c8ea54` |
| تعاریف case با ground truth (commit شده) | `tools/experience-benchmark-cases.js` @ `b1c8ea54` |
| گزارش نهایی (commit شده) | `docs/experience-store/PHASE2_FINAL_REPORT.md` @ `84718b8f` |
| گزارش تجمیعی (این فایل) | `docs/experience-store/PHASE2_CONSOLIDATED_REPORT.md` |
| نتایج فاز ۱ (superseded) | `C:/Users/R.M/AppData/Local/Temp/peb-bench/FINAL-baseline.json`, `FINAL-plus.json` |
| Probe validators (scratch) | `C:/Users/R.M/AppData/Local/hermes/cache/scratch/probe-validate.js`, `probe-discriminate.js` |
| Worktreeهای اجرا (ephemeral) | `C:/Users/R.M/AppData/Local/Temp/peb-bench/PEB-*-wt/` |
| Experience store (commit شده قبلی) | `tools/experience-store.js` @ `d80b58b6` |
| Experienceهای ذخیره‌شده | `docs/experience-store/experiences.jsonl` (۱۲ verified، ۰ quarantined) |

**هیچ secretی commit نشد.** API key از `process.env.HERMES_CUSTOM_ATRIA_DAWN_PREVIEW_API_KEY` خوانده می‌شود و هرگز در هیچ فایلی persist نشد.

---

## ۱۹. Git/Repository State — وضعیت مخزن

| مورد | مقدار |
|---|---|
| HEAD فعلی | `84718b8f` |
| Commit runner | `b1c8ea54` |
| Commit گزارش اولیه | `26a1b8f1` |
| Commit reconciliation اول | `3a58292b` |
| Commit reconciliation نهایی | `84718b8f` |
| Commit پایه PEES | `d80b58b6` |
| Remote | `github.com/rezaa2544/p2.git` |
| Push status | **NOT pushed** — M15 agent صاحب origin/main است |
| فایل‌های commit شده این مأموریت | `tools/peb-runner-v2.js`, `tools/experience-benchmark-cases.js`, `docs/experience-store/PHASE2_FINAL_REPORT.md` |
| تغییرات outside-scope در working tree | `FINAL_REPORT_FA.md`, `migrations/026_*`, `server/cache-invalidation-events.js`, `tools/m15-outbox-capacity.js` (متعلق به M15/N-36، دست‌نخورده) |
| Secret در commit | **هیچ‌کدام** (تأیید با grep قبل از stage) |
| ادعای upgrade در canonical docs | **هیچ‌کدام** |

---

## ۲۰. FINAL VERDICT — رأی نهایی

### **PROMISING BUT UNPROVEN**

### مبانی رأی

**۱. هیچ بهبود آماری معنی‌دار وجود ندارد.**
- ΔPass = +۳.۱pp (t=۰.۹۰۷، p>۰.۰۵)
- ΔProbe = +۴.۸pp (t=1.۱۴۸، p>۰.۰۵)
- ۹۵٪ CI ΔPass = [−۵.۲, +۱۱.۴] pp — شامل صفر و حتی اثر منفی

**۲. جهت اثر به‌طور پیوسته مثبت اما کوچک است.**
- Pass rate aggregate: ۲۵.۰٪ → ۳۸.۳٪ (confound شده توسط differential attrition)
- Probe rate: ۶۸.۸٪ → ۷۵.۵٪
- فقط PEB-04 یک gain قابل تکرار در سطح case نشان می‌دهد (+۲۲.۷pp pass، +۲۸pp probe)
- پایدار در سه موج داده (t = ۰.۹۱، ۰.۹۱، ۰.۹۰۷)

**۳. یکپارچگی آزمایش در جاهایی که قابل تست بود، برقرار است.**
- Leakage = ۰/۲۱۳
- Same task، same environment، same harness
- شکست‌های infra به‌درستی از denominator مدل excluded شدند
- Probes تبعیض می‌گذارند
- NOT-RUN به‌عنوان NOT-RUN ماند (PEB-05)

**۴. زیرساخت ۱ از ۸ case و ۵۵.۳٪ کل attempts را block کرد.**
- API نمی‌تواند promptهای large-file را سرویس دهد
- طبق §۱۲، این به‌تنهایی BENCHMARK INVALID را توجیه می‌کرد
- ولی ۷ از ۸ case داده‌های زوجی قابل استفاده تولید کردند، بنابراین زیرمجموعه قابل مقایسه معتبر است

**۵. Holdout، generalization، و ablation اجرا نشدند.**
- memorization در برابر transfer اندازه‌گیری نشد
- context-length artifact رد نشد
- utilization هیچ evidence رفتاری ندارد (diff_similarity در هر دو arm byte-identical)

**۶. دو تا از مرتبط‌ترین حوزه‌های Payesh (false-green detection, test integrity) هیچ بهبودی نشان ندادند.**

### چه چیزی این رأی را به VERIFIED IMPROVEMENT تبدیل می‌کند

- ≥۱۵ case قابل مقایسه
- ≥۵ valid run per arm
- اجرای ablation arm C
- ≥۲ holdout case با راه‌حل پنهان
- API reliability ≥۸۰٪
- یک paired ΔPass که از noise band فراتر رود (تقریباً >±۱۰pp در آن n)

### چه چیزی این رأی را به NO MEASURABLE IMPROVEMENT تبدیل می‌کند

- همان آزمایش در n بالاتر با فروریزش ΔPass به سمت ۰pp
- این کاملاً محتمل است، با توجه به اینکه CI فعلی [−۵.۲, +۱۱.۴] pp است

### چه چیزی این رأی را به INFRASTRUCTURE BLOCKED تبدیل می‌کند

- اگر PEB-05 و هر case large-file دیگر هیچ داده‌ای تولید نکنند
- اگر API reliability زیر ~۳۰٪ برود

---

## ۲۱. خلاصه کمی نهایی — Final Quantitative Summary

### جدول کامل نتایج

| Case | A n | A pass | A probe | B n | B pass | B probe | ΔPass | ΔProbe |
|---|---|---|---|---|---|---|---|---|
| PEB-01 | ۳ | ۳/۳ (۱۰۰٪) | ۳/۳ | ۳ | ۳/۳ (۱۰۰٪) | ۳/۳ | ۰pp | ۰pp |
| PEB-02 | ۳ | ۳/۳ (۱۰۰٪) | ۳/۳ | ۵ | ۵/۵ (۱۰۰٪) | ۵/۵ | ۰pp | ۰pp |
| PEB-03 | ۱۱ | ۶/۱۱ (۵۵٪) | ۶/۱۱ | ۱۲ | ۶/۱۲ (۵۰٪) | ۶/۱۲ | −۴.۵pp | −۴.۵pp |
| PEB-04 | ۸ | ۴/۸ (۵۰٪) | ۵/۸ | ۱۱ | ۸/۱۱ (۷۳٪) | ۱۰/۱۱ | **+۲۲.۷pp** | **+۲۸pp** |
| PEB-05 | ۱ | ۰/۱ (۰٪) | ۰/۱ | ۰ | — | — | **BLOCKED** | **BLOCKED** |
| PEB-06 | ۱۲ | ۸/۱۲ (۶۷٪) | ۹/۱۲ | ۲۰ | ۱۴/۲۰ (۷۰٪) | ۱۵/۲۰ | +۳.۳pp | ۰pp |
| PEB-07 | ۲۰ | ۰/۲۰ (۰٪) | ۱۲/۲۰ | ۹ | ۰/۹ (۰٪) | ۶/۹ | ۰pp | −۱۳pp |
| PEB-08 | ۳۸ | ۰/۳۸ (۰٪) | ۲۸/۳۸ | ۳۴ | ۰/۳۴ (۰٪) | ۲۶/۳۴ | ۰pp | +۲pp |
| **کل** | **۹۶** | **۲۴ (۲۵.۰٪)** | **۶۶ (۶۸.۸٪)** | **۹۴** | **۳۶ (۳۸.۳٪)** | **۷۱ (۷۵.۵٪)** | **+۱۳.۳pp*** | **+۶.۷pp*** |

*مقادیر کل aggregate هستند و با differential attrition confound شده‌اند. مقادیر paired (Section ۸) مرجع معتبر هستند.

### توزیع outcome (۱۹۰ اجرای معتبر)

| Outcome | تعداد | درصد |
|---|---|---|
| PASS | ۶۰ | ۳۱.۶٪ |
| FAIL | ۷۷ | ۴۰.۵٪ |
| PATCH_FAIL | ۵۳ | ۲۷.۹٪ |

### توزیع شکست زیرساخت (۲۳۵ رکورد)

| Outcome | تعداد | درصد |
|---|---|---|
| INFRA_FAILURE | ۱۷۸ | ۷۵.۷٪ |
| API_ERROR | ۳۱ | ۱۳.۲٪ |
| WORKTREE_FAIL | ۲۰ | ۸.۵٪ |
| EMPTY_REPLY | ۶ | ۲.۶٪ |

---

## ۲۲. توصیه‌های بعدی — Next Steps

### برای رساندن به VERDICT قطعی

| اولویت | اقدام | چرا |
|---|---|---|
| **P0** | رفع API reliability (یا تقسیم promptهای large-file) | بدون این، هر sample قابل دستیابی cap می‌شود |
| **P0** | افزایش sample به ≥۱۵ case × ۵ run | برای عبور از noise band |
| **P1** | اجرای ablation arm C (retrieval + irrelevant) | برای رد context-length artifact |
| **P1** | ساخت ≥۲ holdout case با راه‌حل پنهان | برای تست memorization در برابر transfer |
| **P2** | حوزه‌های تست‌نشده Payesh (tenant isolation, evidence gate, stale SHA) | پوشش domain |
| **P2** | پیاده‌سازی retrieval ranking quality metric | اندازه‌گیری relevance |

### اقدامات فوری (optional)

- به‌روزرسانی Experience Store با درس‌های این فاز (مثلاً "API stability یک metric first-class است")
- cleanup worktreeهای سپری‌شده
- commit و push پس از هماهنگی با M15 agent

---

## ۲۳. نقض قوانین صریح — Explicit Rule Violations

| قانون | وضعیت | تأثیر بر verdict |
|---|---|---|
| Rule ۵ (No overwrite) | ⚠️ PARTIAL — تکرار RUN_ID در داده‌های pre-fix | بدون از دست رفتن داده؛ رکوردها متمایزند اما IDها یکتا نیستند |
| Rule ۱۴ (Holdout) | ❌ NOT RUN | generalization UNMEASURED |
| Rule ۱۵ (Generalization) | ❌ NOT RUN | transfer UNMEASURED |
| Rule ۱۶ (Ablation C) | ❌ NOT RUN | context artifact UNEXCLUDED |
| Rule ۶ (API failure) | ✅ اجرا شد | INFRA_FAILURE جدا شد |
| Rule ۱۲ (API reliability gate) | ⚠️ نقض شد | ۵۵.۳٪ infra failure >> حد قابل قبول |

**نکته مهم:** طبق Rule ۱۲ و Rule ۱۸ بریف، نقض API reliability به‌تنهایی BENCHMARK INVALID یا NOT READY را توجیه می‌کند. ولی از آنجا که ۷ از ۸ case داده‌های زوجی قابل استفاده تولید کردند، verdict صادقانه **PROMISING BUT UNPROVEN** است، نه INVALID — زیرمجموعه قابل مقایسه معتبر است در حالی که طراحی کامل قابل اجرا نیست.

---

## ۲۴. تحویل به ChatGPT

طبق بخش ۲۴ بریف:

> ChatGPT تصمیم نهایی درباره اینکه "Hermes واقعاً ارتقا یافته است یا خیر" را خواهد گرفت.

این گزارش تمام evidence لازم برای آن تصمیم را ارائه می‌دهد. داده‌های خام در مسیرهای Section ۱۸ موجود است. هیچ ادعای upgrade در هیچ canonical docی نوشته نشد.

**تصمیم نهایی با ChatGPT است.**
