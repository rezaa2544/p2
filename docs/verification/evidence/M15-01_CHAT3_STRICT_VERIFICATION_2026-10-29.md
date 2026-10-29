# M15-01 — CHAT 3: گزارشِ راستی‌آزماییِ سخت‌گیرانه روی candidate فعلی

نقش: **Chat 3 — Sync/Data-write reliability**
تاریخ: 2026-10-29 · شاخه‌ی کار: `arena/2f9a9e82-p2` (پایه `fff1beae09ff45d69e554f8c000a9d15b75d968c`)
مخاطبِ خروجی: **Chat 1**

> **حکمِ یک‌خطی:** candidate فعلی **سبز نیست و certified نیست**. گیت با `exit 1` و
> `VERDICT NOT VERIFIED` می‌بندد (۶۶ خطای ساختاری، همه از یک ریشه: رجیستری به SHA
> قدیمی bind شده است). هیچ status، هیچ evidence SHA و هیچ عددی در این گزارش ارتقا
> داده نشده و **رجیستری دست‌نخورده مانده است**. یک نقصِ اثبات‌شده‌ی کد (نه در گیت، در
> ابزارِ provenance) با تستِ رگرسیون و patch مستند شده است، و یک **بن‌بستِ ساختاری**
> اثبات شده که تصمیمِ مالک را لازم دارد: با وجودِ ۲۹ آیتمِ blocked، خروجِ ۰ حتی پس از
> یک landing کاملاً قانونی هم **دست‌نیافتنی** است.

---

## ۰. دارایی‌های این بسته

| مورد | مسیر |
|---|---|
| این گزارش | `docs/verification/evidence/M15-01_CHAT3_STRICT_VERIFICATION_2026-10-29.md` |
| جدولِ ماشین‌خوانِ فرمان‌ها | `docs/verification/evidence/m15-01-chat3-2026-10-29/RESULTS.tsv` |
| خروجیِ کاملِ stdout/stderr هر فرمان | `docs/verification/evidence/m15-01-chat3-2026-10-29/logs/` |
| محیط، SHAها، پیش‌پروازِ metadata | `.../ENVIRONMENT.txt` |
| وضعیتِ درخت‌های اجرا | `.../TREESTATE.txt` |
| اثباتِ ancestry از API گیت‌هاب | `.../gh-compare-bf263bf-344a9db.json`، `.../gh-compare-bf263bf-main.json` |
| بستهٔ تصمیمِ مالک (OD-2/3/4) | `docs/verification/evidence/OD_DECISION_PACKET_M15-01_CHAT3_2026-10-29.md` |
| patch پیشنهادی (اعمال‌نشده) | `.../patch/0001-m15-01-provenance-shallow-history.patch` |
| آزمایشِ ساختاری (synthetic) | `.../experiments/registry-headline-reachability.js` |

---

## ۱. روش و محدودیت‌ها (صادقانه)

1. همه‌ی اجراها **read-only** روی سه worktree مجزا از یک مخزنِ مشترک انجام شد؛ هیچ ref و
   هیچ branch جابه‌جا نشد: `/tmp/wt-src` = `344a9db` (source/landing tip)،
   `/tmp/wt-land` = `3222709` (merge candidate)، `/tmp/wt-seed` = `344a9db` + seed
   توسعه‌ایِ مستند. `TREESTATE.txt` نشان می‌دهد در هر سه، `tracked-drift` خالی است.
2. **محدودیتِ محیط:** چک‌اوتِ این sandbox **shallow** است و مرزِ برش روی
   `fff1beae…` (base commit) است. پس هر پرس‌وجوی ancestry که در همین کلون اجرا شود
   برای commitهای قدیمی‌تر از مرز، «نیست» می‌گوید حتی اگر واقعاً ancestor باشند.
   این محدودیتِ **محیطِ من** است، نه نقصِ پروژه؛ برای همین ancestry با API مقایسه‌ی
   گیت‌هاب هم اثبات شده است (§۳-۴). همین محدودیت، نقصِ اثبات‌شده‌ی §۷ را آشکار کرد.
3. اجراهای امروزِ من (fixtures و گیت) **شاهدِ رجیستری نیستند** و نباید داخلِ رجیستری
   کپی شوند: آن‌ها در worktreeهایِ scratch تولید شده‌اند و artifactشان در آن SHA
   کامیت نشده است. برای bind شدن، باید روی SHA منجمد دوباره اجرا و لاگ‌ها در همان
   SHA کامیت شوند (§۹).
4. هیچ فایلِ رجیستری، workflow، ابزار یا تستی روی خطِ candidate در این نشست تغییر
   نکرده است. تنها تغییرِ کد، یک **فایلِ patch** است که روی هیچ شاخه‌ای اعمال نشده.

---

## ۲. وضعیتِ واقعیِ candidate (اعداد، نه ادعا)

| قلم | مقدار | منبع |
|---|---|---|
| PR source tip | `344a9dbf82fe9dafc0b8bf9fa5ed2b5334998272` (تک‌والد: `46c45041…`) | `git rev-list --parents -n 1` |
| merge candidate | `3222709cfd96abf94bd5902b31d489b169e6d860` (**دو والد**: `fff1beae…` + `344a9dbf…`) | همان |
| تفاوتِ landing با source | **خالی** (landing چیزی به source اضافه نمی‌کند) | `git diff --name-only` |
| حجمِ محتوای PR نسبت به base | ۶۳ مسیر | `git diff --name-only fff1bea 3222709 \| wc -l` |
| `origin/main` در این چک‌اوت | `fff1beae09ff45d69e554f8c000a9d15b75d968c` | `git rev-parse` |
| `registry.head_bound` | `bf263bf253696d3afac2057332eb29c7dd7820a5` | رجیستری |
| `registry.status` | `UNKNOWN` | رجیستری |
| آیتم‌ها | ۳۲ = ۲۹ `UNKNOWN` (blocked) + ۳ `RUNTIME_VERIFIED` | رجیستری |
| `expected_ids` | ۳۲ | رجیستری |
| آیا PR رجیستری را تغییر می‌دهد؟ | **نه** — `VERIFICATION_REGISTRY.json` در diff نیست و sha256 آن روی `main` و روی `344a9db` یکسان است: `f5d13488…364c` | `sha256sum` + `git diff` |

SHAهای ابزار در `344a9db` (برای بازتولید):

```
8d433db1aa1f626a0fc70cc9bc3313a7afd04932721ba8c92a22ed80685e0159  tools/strict-verification-gate.js
ff525399a709c4b815617371e4a7a204fcd4cb82289f3544435a0ba693d8a9e3  tools/registry-provenance.js
f5d1348825af1dab4f48bf338a563f8c88994f81e8c52915b619ffb6c099364c  docs/verification/VERIFICATION_REGISTRY.json
9a7a81fddc2cc2cff4f28f0f19a77bc9f4bb9c22d018c994c72b0d43ec0b51d0  docs/verification/VERIFICATION_EVIDENCE_SCHEMA.json
```

---

## ۳. اجرای گیت روی source (`344a9db`)

```
cd <worktree @ 344a9db>
node tools/strict-verification-gate.js          # exit 1 · 1457 ms
stdout → logs/gate-source-344a9db.stdout (79 395 B, sha256 22f7c98c…2539)
stderr → logs/gate-source-344a9db.stderr (0 B, sha256 e3b0c442…b855)
```

خطوطِ پایانی (نقلِ عین، بدون ویرایش):

```
RESULT 632 pass / 66 fail
HEAD 344a9dbf82fe9dafc0b8bf9fa5ed2b5334998272
EVIDENCE_SHA 344a9dbf82fe9dafc0b8bf9fa5ed2b5334998272
CERTIFIED 0
CONTRACT FAIL
VERIFIED_ITEMS 3/32 at registry status UNKNOWN
VERDICT NOT VERIFIED
```

### ۳-۱. تاکسونومیِ ۶۶ خطا (کامل، بدون باقی‌مانده)

| نوع | تعداد | علتِ دقیق |
|---|---|---|
| `G9 <id> binds immutable evidence SHA` | ۳۲ | `item.head_sha = bf263bf2` ≠ evidence SHA `344a9db` |
| `V-02 <id> evidence binds …` | ۳۲ | فقط و فقط `head_sha mismatch` — هیچ خطای artifact/sha256/exit_code/checks/ts در هیچ‌کدام نیست |
| `V-02 registry head_bound matches …` | ۱ | `head_bound = bf263bf2` ≠ `344a9db` |
| `V-06 HEAD contained in origin/main` | ۱ | HEAD (PR tip) در `origin/main` نیست — طبیعیِ PRِ merge‌نشده؛ طبق طراحی V-06 branch-aware است |

نکته‌ی مهم و ظریف که نباید اشتباه خوانده شود: چون هیچ‌یک از ۳۲ رکورد خطای
artifact/hash/exit ندارد، **بایت‌های شاهد اصیل‌اند** و artifactها در `344a9db`
وجود دارند و sha256 اعلام‌شده را می‌دهند؛ اما اجرا **روی این source انجام نشده**
است. پس اقدامِ قانونی «اجرای دوباره» است، نه «بازنویسیِ `head_sha`». بازنویسیِ
`head_sha` بدون اجرای واقعی = جعلِ شاهد و ممنوع است.

`64` خط `N/A` هم در همین خروجی هست: تمامِ چک‌های استقلال (V-03/G16) با یک اسلاتِ
داور به‌صورت N/A گزارش می‌شوند و **به‌عنوان pass شمرده نمی‌شوند**.

---

## ۴. `registry-provenance.js --audit` روی source

```
cd <worktree @ 344a9db>
node tools/registry-provenance.js --audit      # exit 2 · 431 ms
stdout → logs/provenance-source-344a9db.stdout (2 498 B, sha256 3a4ace61…03eb)
stderr → logs/provenance-source-344a9db.stderr (0 B)
```

خلاصه‌ی خروجی: `UNBOUND 32` (هیچ آیتمی لایهٔ `--bind` ندارد)، `CURRENT 0`،
`STALE 0`، سپس:

```
V-02 HEAD-BIND: MISMATCH — DIVERGED (head_bound is not in the history of the evidence commit — re-verify from scratch)
  ancestor-of-evidence: NO
EVIDENCE_SHA 344a9dbf82fe9dafc0b8bf9fa5ed2b5334998272
AGREES-WITH-GATE: NO (gate would also fail V-02)
```

**این خط از نظرِ لغوی درست نیست و در §۷ اثبات و رفع شده است.** واقعیت اندازه‌گیری‌شده:

| پرس‌وجو | نتیجه |
|---|---|
| در کلونِ shallowِ این sandbox: `git merge-base --is-ancestor bf263bf2 344a9db` | exit 1 («نیست») — به‌خاطرِ برشِ history روی `fff1bea` |
| در تاریخِ کامل (API مقایسه‌ی گیت‌هاب، `gh-compare-bf263bf-344a9db.json`) | `status: ahead`, `behind_by: 0`, `ahead_by: 24`, `merge_base_commit: bf263bf2…` ⇒ **bf263bf2 قطعاً ancestor است** |
| مقایسه‌ی `bf263bf2…main` | `ahead_by: 7`, `behind_by: 0` (main هفت commit بعد از بستهٔ پیشین است) |

پس درست آن است که بگوییم «شاهد روی ancestor تولید شده و کهنه است (STALE)» و
«اثباتِ ancestor-vs-diverged در این کلون ممکن نیست (UNDECIDABLE)» — نه «DIVERGED،
از صفر دوباره تأیید کن». خروجیِ code یعنی `exit 2` در هر دو حالت درست بود؛ فقط
**برچسب و درمان** غلط بود.

---

## ۵. گیت و provenance روی merge candidate (`3222709`)

```
cd <worktree @ 3222709>
node tools/strict-verification-gate.js          # exit 1 · 1429 ms → logs/gate-landing-3222709.stdout
node tools/registry-provenance.js --audit       # exit 2 ·  376 ms → logs/provenance-landing-3222709.stdout
```

```
RESULT 632 pass / 66 fail
HEAD 3222709cfd96abf94bd5902b31d489b169e6d860
EVIDENCE_SHA 3222709cfd96abf94bd5902b31d489b169e6d860
CONTRACT FAIL
VERIFIED_ITEMS 3/32 at registry status UNKNOWN
VERDICT NOT VERIFIED
```

خطِ کلیدیِ سومِ خروجی گیت:

```
OK V-02 evidence binding mode explicit — metadata-only binding requires a non-merge commit with exactly one parent; parent_count=2
```

یعنی merge candidate **از نظرِ ساختار نمی‌تواند** کامیتِ متادیتا باشد (دو والد).
پس `3222709` مسیرِ فرودِ OD-3 نیست؛ فقط یک merge برای آزمون است.

---

## ۶. fixtures: فرمان، exit، runtime، SHA، لاگ

همه روی `344a9db`. هر فایلِ لاگ با sha256 در `RESULTS.tsv` فهرست شده است.
(به‌جز موارد علامت‌خورده، `stderr` خالی است.)

| # | فرمان | exit | ms | نتیجه |
|---|---|---|---|---|
| ۱ | `node tests/strict-verification-gate.negative.test.js` | 0 | 5938 | `55 pass / 0 fail`؛ شاملِ پنج fixtureِ Issue #472: merge commit، مسیر اضافه، rename به رجیستری، کامیتِ empty، کامیتِ بی‌والد — همه `exit=1` (رد شد) |
| ۲ | `node tests/strict-verification-gate-a30.test.js` | 0 | 1729 | `CHECKS 21 FAIL 0`؛ شاملِ «بلوکِ صادقانه سبز نمی‌شود»، «اسکنر V-07 الگوی تزریقی را می‌گیرد»، «V-06 با intended-head بیرونی fail-closed» |
| ۳ | `node tests/m15-01-registry-strict-verification.test.js` | 0 | 6547 | `CHECKS 32 FAIL 0`؛ ۳۲ سنجه + کنترلِ غیرِ‌توخالی‌بودن: هر fixture روی گیتِ عمداً سست‌شده باید «پذیرفته» شود تا ثابت شود سنجه توخالی نیست |
| ۴ | `node tests/registry-provenance-protocol.test.js` | 0 | 446 | `16/16`؛ A: metadata-only با گیت هم‌خوان، B: SHA ساختگی، C: کهنه، D: واگرا، E: کامیتِ کد |
| ۵ | `node tests/strict-gate-empty-registry.js` | 0 | 134 | `PASS: 2 empty-registry rejection cases` |
| ۶ | `node tests/false-green-defense.test.js` | 0 | 5919 | `44/44`؛ runnerِ API برای zero-execution/skip-only/swallowed-fail/zero-pass صدادار قرمز می‌شود (`stderr` داوری‌ها عمدی است) |
| ۷ | `node tests/monitoring/observability/metrics-integrity.test.js` | 0 | 40 | گاردِ تمامیتِ متریک‌ها سبز |
| ۸ | `node tests/n03-n11-n12-fabricated-metrics.test.js` | **1** | 57 | `6/7` — فقط `N03-1` به‌دلیلِ نبودِ `server/data/payesh.json` (gitignored). `N11-1`, `N11-2`, `N12-1` سبز |
| ۹ | `node tests/api/observability-health.test.js` | **1** | 29 | `ENOENT … server/data/payesh.json` — همان علتِ محیطی |
| ۸ب | در `/tmp/wt-seed`: `node server/seed.js && node tests/n03-n11-n12-fabricated-metrics.test.js` | 0 | 135 | `7/7` — پس شکستِ ۸ محیطی بود، نه رگرسیونِ N-11 |
| ۹ب | در `/tmp/wt-seed`: `node server/seed.js && node tests/api/observability-health.test.js` | 0 | 421 | `6 passed, 0 failed` — شاملِ `OBS…` و تضمینِ «اندازه‌گیری‌نشده = UNKNOWN» |

توضیحِ منصفانه درباره‌ی ۸ و ۹: `server/data/` در `.gitignore` است (خطِ ۳۳)، و
`node server/seed.js` مسیرِ رسمیِ ساختِ آن است (`docs/DEVELOPMENT.md`). اجرای ۸ب/۹ب
فقط یک فایلِ ignored را در یک worktree جدا ساخت؛ هیچ فایلِ tracked تغییر نکرد
(`TREESTATE.txt`: `tracked-drift` خالی، فقط `!! server/data/`).

---

## ۷. نقصِ اثبات‌شده و patch (فقط همینی که اثبات شد)

### ۷-۱. نقص

`tools/registry-provenance.js` (نسخه‌ی `344a9db`) ناقص‌بودنِ تاریخِ کلون را با
واگراییِ واقعی یکی می‌گیرد و نتیجه را به‌صورتِ **ادعای قطعی** چاپ می‌کند:

```
V-02 HEAD-BIND: MISMATCH — DIVERGED (… — re-verify from scratch)
  ancestor-of-evidence: NO
```

در حالی که در همان لحظه، تاریخِ کامل (و API گیت‌هاب) می‌گوید آن SHA **ancestor**
است. هم برچسب غلط است، هم درمان («از صفر دوباره تأیید کن»). خانواده‌ی همین نقص:
SHAای که در کلونِ shallow وجود ندارد، «INVALID — not a commit in this repository»
نام می‌گیرد، در حالی که ممکن است فقط fetch نشده باشد. این همان کلاسِ «ادعای
فراتر از شاهد» است که این مخزن صریحاً رد می‌کند (پیش‌تر هم P2 در همین فایل: یک
خطِ اطمینان‌بخشِ ساختگی).

اثر: **exit code تغییر نمی‌کند** (هر دو حالت ۲)، پس هیچ گیتی دور زده نشده و هیچ
چیز سبزی ساخته نشده بود؛ نقص، «درست‌نگفتن» است.

### ۷-۲. patch

`patch/0001-m15-01-provenance-shallow-history.patch` (۳۶۴ خط؛ روی `344a9db`
با `git apply --check` تأیید شد). تغییرها:

1. تشخیصِ یک‌بارهٔ shallow (`git rev-parse --is-shallow-repository`).
2. حالتِ جدیدِ `UNDECIDABLE` برای «shallow + گراف بریده» و برای «SHA در shallow
   موجود نیست» — با پیامِ درمانِ درست (`git fetch --unshallow` و اجرای دوباره).
3. خطِ `ancestor-of-evidence` دیگر هرگز `NO` را وقتی گراف توانِ اثباتش را ندارد
   چاپ نمی‌کند.
4. `exit 2` برای همه‌ی حالت‌های mismatch **بدون تغییر** (fail-closed دست‌نخورده).
5. تستِ رگرسیونِ جدید `tests/registry-provenance-shallow-history.test.js` با git
   واقعی و cloneِ shallowِ واقعی (`--depth 1` + `fetch --depth 1` روی tag)، چهار
   حالت A/B/C/D.

### ۷-۳. اثبات (نه ادعا)

| اجرا | exit | نتیجه |
|---|---|---|
| تستِ جدید با patch (`598c124…` = `344a9db`+patch) | 0 | `24/24` — `logs/patch-regression-with-patch.stdout` |
| همان تست با ابزارِ **بدونِ patch** (`PROV_TOOL_SRC`) | 1 | `19/24` — ۵ سنجه قرمز، از جمله چاپِ `DIVERGED` و `ancestor-of-evidence: NO`: fixture توخالی نیست |
| `tests/registry-provenance-protocol.test.js` با patch | 0 | `16/16` — قراردادِ موجود نشکست |
| گیتِ کامل با patch روی همان درخت | 1 | `632 pass / 66 fail` — **عیناً** مثلِ بدونِ patch: هیچ اثری روی گیت ندارد |
| provenance با patch روی همان درخت | 2 | `MISMATCH — UNDECIDABLE` + `history: SHALLOW clone` — همان درستی، اکنون صادقانه |

دستورِ بازتولید:

```
git worktree add --detach /tmp/wt-check 344a9dbf82fe9dafc0b8bf9fa5ed2b5334998272
cd /tmp/wt-check && git apply <patch>
node tests/registry-provenance-shallow-history.test.js                       # 24/24
PROV_TOOL_SRC=/tmp/unpatched-provenance.js node tests/registry-provenance-shallow-history.test.js   # 19/24
node tools/registry-provenance.js --audit                                    # UNDECIDABLE, exit 2
node tools/strict-verification-gate.js                                       # 632/66, exit 1 (بی‌تغییر)
```

**پیشنهاد به Chat 1:** این patch را روی خطِ source اعمال کنید **پیش از** انجمادِ
source، تا شاهدِ نهایی با ابزارِ درست تولید شود؛ وگرنه auditِ نهایی دوباره
`DIVERGED` چاپ می‌کند (نادرست، هرچند fail-closed).

---

## ۸. بررسیِ دست‌نخورده‌بودنِ کنترل‌ها (خواستهٔ صریح)

| کنترل | دست‌نخورده؟ | شاهد |
|---|---|---|
| **V-02** (binding: head + artifact موجود + sha256 + bytes در evidence SHA + exit 0 + checks_passed==checks_total + ts غیرِ‌آینده) | بله | ۳۲ خطای V-02 همه فقط `head_sha mismatch`؛ هشت fixtureِ خانوادهٔ V-02 (`V-02`, `b`, `c`, `d`, `e`, `f`, `g` + یک موردِ PR/دیورجنت) همه `exit=1` (رد) — از جمله «head_sha جعلی»، «sha256 نامطابق»، «artifact پس از کامیت ویرایش‌شده»، «artifact کامیت‌نشده»، «اجرای ناموفق»، «۹ از ۱۲ چک»؛ property test هرکدام را روی گیتِ سست‌شده «پذیرفته» می‌بیند ⇒ سنجه توخالی نیست |
| **V-15** (سرفصل ≤ ضعیف‌ترین آیتم) | بله | `OK V-15 … top=UNKNOWN(0) weakest_item_rank=0`؛ سناریوی C در §۸-۳ نشان می‌دهد بالا بردنِ سرفصل رد می‌شود |
| **V-15b** (آیتمِ blocked سرفصل را زیرِ باندِ verifying نگه می‌دارد) | بله | `OK V-15b … blocked_items=29 top=UNKNOWN` |
| **V-16** (رجیستریِ schema-سالم که چیزی را تأیید نمی‌کند سبز نیست) | بله | در اجرای واقعی `nothingVerified` به‌خاطرِ `fail>0` چاپ نمی‌شود ولی حکم `NOT VERIFIED` است؛ در آزمایشِ سنتزیِ §۸-۳ حالتِ A **کل قرارداد را پاس می‌کند و فقط V-16 آن را رد می‌کند** |
| **V-17** (یک شاهد نمی‌تواند چند ادعا را با کپی بپوشاند) | بله و **مؤثر** | `32/32 OK`؛ سه آیتمِ M15-01 عیناً همان دو لاگ را cite می‌کنند و فقط به‌خاطرِ `scope` متمایز رد نمی‌شوند؛ توکن‌های scope واقعاً در artifactها هستند (`P1/P4/P2/P3/P5` در `m15-01-focused-suite.log`، `V-02c…V-02g/G8-dup` در `m15-01-negative-fixtures.log`) — راستی‌آزمایی‌شده با grep |
| **V-18** (سقفِ status با ۱ اسلاتِ داور) | بله | `32/32 OK`؛ هیچ آیتمی `INDEPENDENTLY_VERIFIED`/`CERTIFIED` نیست؛ سقف `ADVERSARIAL_VERIFIED` |
| **N-11** (اندازه‌گیری‌نشده ≠ سالم) | بله | `N11-1`/`N11-2` سبز (۱۴/۷ و ۱۴/۹ب)؛ گاردهای کد در `server/monitoring/production-observability.js:49,266,325,367,594` دست‌نخورده و تست‌شده |
| **پروتکلِ دومرحله‌ای (two-phase metadata)** | بله | پنج fixtureِ Issue #472 همه `exit=1`؛ `V-02 evidence binding mode explicit` روی `3222709` می‌گوید `parent_count=2` ⇒ merge رد می‌شود؛ fixtureهای A-30 «مسیر اضافه/rename/empty/بی‌والد» را رد می‌کنند |
| **استقلالِ شاهد (evidence independence)** | بله، با افشای صریح | V-03/G16 با یک اسلات **N/A** گزارش می‌شوند (۶۴ خط N/A)، نه pass؛ رجیستری خودش `independence.model = arena-only`, `reviewer_slots: 1`, `pairwise_reviewer_independence = UNAVAILABLE` را ثبت کرده؛ یعنی «Arena تأییدِ Arena» است و ادعای استقلال نمی‌شود |
| **fail-closed برای خروجیِ ناقص** | بله | `strict-verification-gate-empty-registry.js` (۲ مورد)، `false-green-defense` (۴۴/۴۴: zero-execution/skip-only/swallowed-fail/zero-pass)، `G14a..G14d` سبز، `V-01/V-05/V-12` سبز |

### ۸-۱. یک نکتهٔ صادقانه دربارهٔ شاهدِ مشترک

سه آیتمِ `M15-01-A/B/C` روی **همان دو اجرا** (focused-suite + negative-fixtures) و
با `scope`های متفاوت تکیه کرده‌اند. این کار طبقِ V-17 مجاز و راستی‌آزمایی‌شده است
(توکن‌های scope در لاگ‌ها واقعاً وجود دارند)، اما معنایش این است: **سه ادعا از دو
اجرا**، نه سه اجرای مستقل. اگر مالک «استقلال» را به‌معنای اجرای مستقل بخواهد، آن
یک تصمیمِ جداگانه است و در وضعیتِ فعلی ادعا **نمی‌شود**.

### ۸-۲. مشاهداتِ بدونِ patch (کم‌اهمیت، برای شفافیت)

* خطِ `BLOCKER — V-16 …` فقط وقتی چاپ می‌شود که `fail === 0` باشد؛ در اجرای واقعی
  با ۶۶ خطا این خط چاپ نمی‌شود. چون حکم در هر حال `NOT VERIFIED` است، این
  «سبزِ کاذب» نیست؛ فقط یک کمبودِ تشخیصی است. **رفع نشد** (خارج از دامنهٔ این نقش).
* `V-06` در حالتِ push روی هر شاخه ساختاراً قرمز است (OD-2) — این طراحی است، نه نقص.

### ۸-۳. یافتهٔ ساختاریِ تازه: با ۲۹ آیتمِ blocked، `exit 0` دست‌نیافتنی است

این را با یک آزمایشِ **سنتزی** (نه با دادهٔ پروژه) اثبات کردم:
`experiments/registry-headline-reachability.js` — exit 0 · 448 ms · `11/11`
(`logs/experiment-headline-reachability.stdout`). سه سناریو با git واقعی و
artifactِ واقعاً کامیت‌شده (پس binding واقعاً برقرار است، نه دور زده):

| حالت | ساختار | نتیجه |
|---|---|---|
| A | یک آیتمِ blocked + یک آیتمِ `RUNTIME_VERIFIED`، سرفصل `UNKNOWN` | `CONTRACT PASS` (**همهٔ** چک‌ها سبز) اما `V-16` رد می‌کند → `exit 1` |
| B | بدونِ آیتمِ blocked، سرفصل `RUNTIME_VERIFIED` | `VERDICT VERIFIED` → `exit 0` (پس هارنس «همیشه‌قرمز» نیست) |
| C | مثل A با سرفصلِ `RUNTIME_VERIFIED` | `V-15b` (و `V-15`) رد می‌کند → `exit 1` |

نتیجه: با وجودِ یک آیتمِ blocked، سقفِ قانونیِ سرفصل `TESTED` است (rank 1) و
`V-16` حداقلِ `RUNTIME_VERIFIED` (rank 2) می‌خواهد ⇒ **هیچ سرفصلی هر دو را
برنمی‌آورد**. رجیستریِ فعلی ۲۹ آیتمِ blocked دارد، پس:

> **حتی پس از یک landing کاملاً قانونی و بی‌نقص، گیت `exit 1` می‌ماند.**

این جمله با ادعای موجود در `docs/verification/evidence/M15-01_EXECUTION_MISSION2_2026-10-27.md`
(§۳-۴: «تنها حالتِ سبز = HEAD خودِ کامیتِ تک‌والدِ فقط-رجیستری») **ناسازگار** است؛ آن
ادعا شرطِ لازم را می‌گوید ولی شرطِ کافی نیست. راه‌های قانونیِ رسیدن به سبز فقط دو
تاست و هر دو **تصمیمِ مالک** است: (الف) ۲۹ آیتمِ legacy با شاهدِ واقعی به باندِ
verifying برسند (کارِ محتوایی)، یا (ب) مالک معنای V-15/V-15b/V-16 را عوض کند
(تغییرِ قراردادِ امنیتی — چت مجاز نیست). این یافته در بستهٔ تصمیم به OD-4 گره خورده
است.

---

## ۹. مسیرِ قانونی از این‌جا تا وضعیتِ قابلِ ارزیابی (بدونِ دور زدن)

اصل: **اول source منجمد می‌شود، شاهد به آن bind می‌شود، و تنها چیزی که بعد از آن
فرود می‌آید یک کامیتِ single-parent فقط-رجیستری است. بعد از فرود، گیت و provenance
دوباره اجرا می‌شوند.**

1. **تصمیم/اجرای محتوایی روی source.** اگر patchِ §۷ پذیرفته است، ابتدا آن؛ سپس
   محتوای PR یک‌بار برای همیشه بسته شود. هیچ تغییرِ کد/تست بعد از این نقطه مجاز
   نیست.
2. **فرودِ PR کد (بدونِ رجیستری).** رجیستری در PR نیست (تأییدشده در §۲)، پس این
   فرود یک فرودِ معمولی است. **نقطهٔ انجماد = SHAای است که بعد از این فرود روی
   `main` می‌نشیند** (`F`). اگر استراتژی squash/rebase باشد، `F` **SHA تازه‌ای**
   است و شاهدِ قبلی به آن منتقل نمی‌شود.
3. **تولیدِ شاهد روی `F`.** کلِ باتری (گیت، fixtures، legacy inventory) روی `F`
   اجرا شود. لاگ‌ها باید **در همان `F` کامیت** شوند (چون V-02s بایت‌ها را از
   `evidenceHead` می‌خواند) و سپس یک‌بار دیگر روی همان `F` اجرا و **بایت‌به‌بایت**
   با نسخهٔ کامیت‌شده مقایسه شوند؛ تنها در این حالت است که «اجرا روی `F`» یک
   ادعای درست است. بازنویسیِ `head_sha` بدونِ اجرا ممنوع است.
4. **`F'` = کامیتِ شاهد (اگر لازم شد).** اگر لاگ‌ها در کامیتِ جدا نشستند، همان
   `F'` نقطهٔ انجماد می‌شود و مرحلهٔ ۳ روی `F'` تکرار می‌شود. بعد از این، هیچ
   تغییرِ tracked مجاز نیست (`G17`).
5. **کامیتِ متادیتا `L`:** تک‌والد با والدِ `F'`، و `git diff --name-only --no-renames F' L`
   باید **فقط** `docs/verification/VERIFICATION_REGISTRY.json` باشد. پیش‌پروازِ
   اجباری (بندِ ۸ سندِ `docs/STRICT_VERIFICATION_GATE.md`):
   `git rev-list --parents -n 1 L` = دو توکن، و همان diff = یک مسیر.
6. **فرودِ `L`** با ff/rebase/squash به‌شکلی که والدِ `L` روی `main` همان `F'` بماند.
   `--no-ff` = `parent_count=2` = رد شدنِ privilege (اندازه‌گیری‌شده در §۵).
7. **اجرای دوبارهٔ گیت و provenance روی `L`** (این‌بار غیر-shallow یا با
   `fetch --unshallow` تا برچسبِ ancestry قابلِ اثبات باشد) و ثبتِ خروجیِ خام.
8. انتظارِ درست: `V-02/G9/V-06` پاک می‌شوند، اما تا وقتی ۲۹ آیتمِ blocked در
   رجیستری‌اند، `VERDICT NOT VERIFIED` باقی می‌ماند (§۸-۳).

**ممنوع (هر سه، صریح):** history rewrite/rebaseِ تاریخِ منتشرشده برای جبرانِ
binding؛ هر bypass یا allowlist یا تغییرِ V-06 برای سبزکردن؛ هر «workaround» با
merge commit یا کامیتِ چندوالد برای جا‌زدنِ رجیستری.

---

## ۱۰. وضعیتِ نهایی (بدونِ ارتقا)

| پرسش | پاسخ |
|---|---|
| آیا candidate سبز است؟ | **نه.** `exit 1`, `CONTRACT FAIL`, `VERDICT NOT VERIFIED` (روی هر دو SHA) |
| آیا certified است؟ | **نه.** `CERTIFIED 0` |
| آیا وضعیتِ رجیستری تغییر کرد؟ | **نه.** `status: UNKNOWN`، ۳۲ آیتم، ۲۹ `UNKNOWN`، ۳ `RUNTIME_VERIFIED`، `head_bound: bf263bf2…` — بی‌تغییر |
| آیا شاهدِ جدیدی به رجیستری اضافه شد؟ | **نه.** هیچ فایلی از رجیستری یا `docs/verification/evidence/*` موجودِ پروژه تغییر نکرد |
| آیا کنترل‌ها تضعیف شدند؟ | **نه.** §۸ |
| آیا نقصِ کد رفع شد؟ | یک نقصِ اثبات‌شده (provenance/shallow) **به‌صورتِ patch + تستِ رگرسیون** آماده است، اعمال‌نشده |
| تصمیم‌های باز | OD-2، OD-3، OD-4 — `docs/verification/evidence/OD_DECISION_PACKET_M15-01_CHAT3_2026-10-29.md` |

---

## ۱۱. تحویل به Chat 1 (کارهای مشخص)

1. تصمیم بگیرید patchِ §۷ روی خطِ source اعمال شود یا نه (پیشنهاد: بله، پیش از انجماد).
2. بستهٔ تصمیم را به مالک بدهید؛ **عددِ ۲۹/۳۲/۳۹ و معنای V-06/V-15/V-15b/V-16 را
   چت انتخاب نمی‌کند.**
3. تا روشن‌شدنِ OD-3، **هیچ** کامیتِ رجیستری نسازید؛ هر rebind قبل از انجمادِ source
   دوباره کهنه می‌شود.
4. اجراهای امروز را به‌عنوان «شاهدِ رجیستری» استفاده نکنید (§۱-۳)؛ فقط به‌عنوان
   بازتولیدِ مستقل در این گزارش cite شوند.
