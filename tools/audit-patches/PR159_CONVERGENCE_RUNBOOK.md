# 🧭 کیتِ همگراییِ PR #159 — **اجرای‌مالک** (اجرا توسط چت ۶ مجاز نیست)

**تهیه‌کننده:** چت ۶ (حاکمیت مستندات) · **تاریخ:** ۲۰۲۶-۰۹-۱۳ · **دور:** ۱۲
**هدف:** بستنِ قطعیِ الگوی تعارضِ `rc40` / `rc41` هم‌زمان با حفظِ «تک‌مدعی بودنِ قفلِ جاری».

> ## ⛔ هشدارِ مالکیت
> **این کیت قرار نیست توسط چت ۶ اجرا شود.** اجرای هر یک از مراحل زیر فقط با
> (الف) **مالکِ شاخهٔ #159** (`docs/bh-mut-phase2-report`) یا
> (ب) **واگذاریِ کتبیِ ناظر** مجاز است (قاعدهٔ ۶ + مرزهای مالکیت).
> چت ۶ فقط آن را ساخته و مستند کرده است — صفر تغییر/کامنت/rebase روی #159.

---

## ۰) وضعیتِ اندازه‌گیری‌شده در لحظهٔ تهیه (بازتولید کن، اعتماد نکن)

| قلم | مقدارِ اندازه‌گیری‌شده |
|---|---|
| `main` | **`55c5e15`** (در دور ۱۲ از `952b0ba` جلو رفت) |
| PR #129 | ✅ **MERGED** (دوزیه‌های `REPORT_PERF_GAP_SPEC` · `REPORT_CACHE_ISOLATION_DOSSIER` · `FLAG1_SCOPE_SQL_DOSSIER` اکنون **روی main هستند**) |
| PR #159 | `OPEN` / `DIRTY` · head `80c5910` · ۱۳ فایل · +۶۸۸/−۹۸ · `base.sha` = `1a73c52` |
| PR #157 | ✅ MERGED |
| PR #135 | `CLOSED` / `DIRTY` · head `0c57bb9` |
| شاخهٔ چت ۶ | `arena/01a09801-p2` — قفل **rc42** (۳۲۶ ریشه · ۳۷۲ درخت) |
| سلامتِ main (اجرای تازه، دور ۱۲) | `freeze-marker` **۱۴/۱۴** · `stats-sync --check` **exit 0** (۳۲۷ ریشه · ۳۸۰ درخت · قفلِ جاری روی main = **rc40**) · `metadata` یتیم = ۰ · `reza-mirror` بدون رانش |

---

## ۱) روشِ سنجه در کلونِ کم‌عمق (درسِ دور ۱۱ — الزامی)

در این مخزن `git merge` **ممکن نیست** (کلون کم‌عمق؛ `merge-base` حتی پس از `fetch` کردنِ
`base.sha` ناموجود است). شمارشِ تعارض باید با **three-way merge و پایهٔ صریح** انجام شود:

```bash
# پایه را از API بگیر (پایهٔ PR، نه حدس):
gh api repos/rezaa2544/p2/pulls/159 --jq '.base.sha'      # ⇒ 1a73c52
git fetch origin 1a73c5288067477b3164b6a32425677e730a60cc

# three-way با پایهٔ صریح — بدون worktree، بدون کامیت، بدون تغییر مخزن
export GIT_INDEX_FILE=/tmp/idx && rm -f /tmp/idx
git read-tree -m <base>^{tree} <ours>^{tree} <theirs>^{tree}
git ls-files -u | awk '{print $4}' | sort -u       # فهرستِ تعارض‌ها
git ls-files -u | awk '{print $4}' | sort -u | grep -vc '^docs/'   # code conflicts
git ls-files -u | awk '{print $4}' | sort -u | grep -c  '^docs/'   # doc conflicts
unset GIT_INDEX_FILE
```

### ⚠️ تلهٔ پایهٔ نادرست (۳۸ تعارضِ کاذب)
پایهٔ #159 (`1a73c52`) **جدِ شاخهٔ چت ۶ نیست**:
`compare/1a73c52...<chat6>` ⇒ `diverged`, ahead=۹, behind=۸۲.
استفاده از آن برای سنجهٔ «#159 ↔ شاخهٔ چت ۶» تغییراتِ main را به نامِ #159 می‌نویسد
⇒ **۳۸ تعارضِ کاذب**. **پایهٔ درست برای آن جفت `23bf513` است**
(`compare/23bf513...1a73c52` ⇒ `status=ahead, behind_by=0`).

---

## ۲) نقشهٔ تعارضِ اندازه‌گیری‌شده (دور ۱۱ — بازتولید فقط با فرمان‌های بالا)

| جفت | پایه | code | doc | فایل‌های شاخص |
|---|---|---|---|---|
| #159 ↔ main | `1a73c52` | **۳** | **۵** | `HANDOFF.md` · `monitoring/alert-rules.yml` · `out/dast-live/dry-run-skeleton.txt` · `rc40` · `DOCS_INDEX` · `DOCS_METRICS` · `DOCUMENTATION_MAP` · `NEXT_ACTIONS` |
| #159 ↔ شاخهٔ چت ۶ | **`23bf513`** | **۱** | **۸** | `tests/docs-freeze-marker.js` · **`DOCS_FREEZE_v1.0.0-rc41` (واگرا)** · `rc40` · `DOCS_METRICS` · `DOCUMENTATION_MAP` · `TEST_COVERAGE_REPORT` · `DOCS_CONSISTENCY_REPORT` · **`daily-reports/2026-09-13.md`** · `NEXT_ACTIONS` |

> **ظرافتِ مستند:** `daily-reports/2026-09-13.md` با **main** تعارض ندارد؛ تعارضِ آن
> **با شاخهٔ چت ۶** است (الحاقِ چت ۶ در دور پ۶ در برابر بازنویسیِ +۱۶۵/−۷۸ در #159).

---

## ۳) طرحِ مرج ۷مرحله‌ای (فقط توسط مالک)

```bash
# ۱) rebase روی main جاری
git fetch origin && git rebase origin/main            # (یا merge با تأیید مالک)

# ۲) حلِ تعارضِ docs/daily-reports/2026-09-13.md — «اتحادِ append-only»
#    هر دو بلوک (بخشِ چت ۶ و بلاکِ #159) باید حفظ شوند؛ چیزی حذف نشود.

# ۳) حذفِ فایلِ rc41 واگرا از شاخهٔ #159
git rm docs/DOCS_FREEZE_v1.0.0-rc41.md   # ⇐ فقط اگر قفلِ جاریِ main/chat6 ترجیح دارد

# ۴) بازتولیدِ درجای مانیفستِ قفلِ جاری
node tools/docs-stats-sync.js --freeze
#    اگر شمارِ اسنادِ ریشه تغییر نکرد ⇒ rc تازه نساز (در دور ۱۲: ریشه ۳۲۶ ثابت ⇒ بدون rc43)

# ۵) نگهبان
node tests/docs-freeze-marker.js          # انتظار: ۱۴/۱۴

# ۶) سنجهٔ آمار
node tools/docs-stats-sync.js --check     # انتظار: exit 0

# ۷) دلتای انتظاریِ ارجاع‌ها
node tools/docs-refs-check.js             # اسنادِ جدیدِ #159 باید ارجاعِ ورودی بگیرند
node tools/docs-metadata.js               # انتظار: «یتیم (بدون ارجاع ورودی): هیچ»
```

**خروجیِ انتظار:** قفلِ جاری **تک‌مدعی** · `freeze-marker ۱۴/۱۴` · `stats-sync` سبز · یتیم ۰ ·
بدون ایجادِ `rc41` دوم.

---

## ۴) ترتیبِ مرج پیشنهادی (تصمیم با ناظر)

1. **شاخهٔ چت ۶** (rc41 تاریخی + **rc42 جاری**) — تا فقط یک مدعیِ «جاری» باشد؛
2. **#159** با همین کیت؛
3. **#157** ✅ (انجام شد)؛
4. **#129** ✅ (انجام شد — گزینهٔ بِ دوزیهٔ کش).

> **یادداشتِ الحاقیِ #135:** پچِ `pr135-keep-partB.main-0a208f8.patch` که در دور ۱۰ روی main@`0a208f8`
> **CLEAN** بود، در دور ۱۲ روی main@`55c5e15` دوباره **stale** شد
> (`patch failed: docs/daily-reports/2026-09-12.md:628`) — چون main دائماً جلو می‌رود.
> ⇒ **پچ را در لحظهٔ اجرا بازتولید کنید** (روش در §۵).

---

## ۵) بازتولیدِ پچِ بخش ب در لحظهٔ اجرا (چون main متحرک است)

```bash
# سرِ #135 و پایهٔ عصر
git fetch origin 0c57bb90eec238a8721279491af520daade6431b      # سرِ #135
git show 0c57bb9:docs/daily-reports/2026-09-13-pr-audit-list.md   > /tmp/list.md
git show 0c57bb9:docs/daily-reports/2026-09-13-pr-audit-report.md > /tmp/report.md
git show 523c1f5:docs/daily-reports/2026-09-12.md > /tmp/oldbase.md   # پایهٔ عصر
git show 0c57bb9:docs/daily-reports/2026-09-12.md > /tmp/head135.md
diff /tmp/oldbase.md /tmp/head135.md        # ⇒ بلاکِ الحاقیِ خالص = ۹ خط (۵۹۰–۵۹۸)

# در یک worktree تمیز روی main جاری:
git worktree add --detach /tmp/gen origin/main && cd /tmp/gen
cp /tmp/list.md   docs/daily-reports/2026-09-13-pr-audit-list.md
cp /tmp/report.md docs/daily-reports/2026-09-13-pr-audit-report.md
sed -n '590,598p' /tmp/head135.md >> docs/daily-reports/2026-09-12.md
git add -N docs/daily-reports/2026-09-13-pr-audit-list.md docs/daily-reports/2026-09-13-pr-audit-report.md
git diff > /tmp/partB.patch
git checkout -- . && git clean -fdq docs && git apply --check /tmp/partB.patch   # ⇒ باید exit 0
cd - && git worktree remove /tmp/gen --force && git worktree prune
```

> این دو فایل روی main **وجود ندارند** (تأییدِ دور ۱۲) ⇒ ارزشِ یکتا.
> پس از هر fetchِ پایه در کلون کم‌عمق: `git gc --prune=now` (درسِ بودجه در دور ۱۱/۱۲).
