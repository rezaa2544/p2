# گزارش دور ۱۱ (چت ۳) — Wave 19: تست آشوب و شکست (Chaos Testing)

**تاریخ:** ۲۰/۰۶/۱۴۵ (2026-09-09)
**شاخه:** `arena/01a08545-p2`
**مأموریت (ناظر):** طراحی و مستندسازی سناریوهایِ تستِ آشوب و آماده‌سازیِ ابزارِ شبیه‌سازیِ خرابیهایِ عمدی.

---

## ۱. Audit وضعیتِ پیشین

| موجود | وضعیت |
|---|---|
| `tests/performance/suites/chaos-redis-test.js` (فاز ۵) | کامل: ترافیکِ حینِ قطعِ Redis (30 VU، 45s) با thresholdsِ صریح: **هیچ 500** + p95<400 + صحتِ نشست (JWT بدونِ Redis) + متریک‌هایِ circuit-breaker/latency |
| ابزارِ تزریقِ خرابی | **بود: خیر** ⇒ `tools/chaos-test.sh` ساخته شد |
| طرحِ یکپارچهٔ 5 سناریو با فرضیه | بود: خیر ⇒ `docs/WAVE19_CHAOS_PLAN.md` |

## ۲. پنج سناریو — فرضیه از معماری (نه حدس)

| سناریو | تزریق | فرضیهٔ کلیدی (مکانیزم) |
|---|---|---|
| **kill-api** | `kill -9` (SIGKILL، بدونِ drain) | خوابِ store هرگز خراب نمی‌شود (tmp+rename)؛ عملِ ack‌شده **پیش از پاسخ** mirror شده ⇒ **با PG صفر loss**؛ بدترین حالت (PG هم قطع): فقط پنجرهٔ ≤2s |
| **redis-down** | `SHUTDOWN NOSAVE` در حینِ ترافیک | readiness⇒**503** (Wave 15) + liveness⇒**200** + خوانش‌ها 200 (L1 ≤60s + فال‌بکِ حافظه + single-flight rebuild) + rate-limit **fail-open** + OTP state در حافظه ⇒ **صفر data loss** |
| **pg-down** | `pg_ctl stop -m immediate` | خوانش‌ها از **store** ⇒ دست‌نخورده؛ sync ⇒ 200 + audit `sync_mirror_failed` (کلاینت بی‌خبر)؛ فقط DELETE-REST ⇒ 500 + tombstone می‌ماند + retry ایدمپوتان؛ readiness⇒503 (محافظه‌کارانه) ⇒ **صفر data loss** |
| **net-latency** | `tc netem delay 500ms±100` | p95 خطی + سقفِ سخت 65s (S-73-6) + صفِ syncِ کلاینت offline-first ⇒ تأخیر = UX، صفر loss |
| **disk-full** | `fallocate` (سقفِ ایمنی 5GB) | persistStore crash-free (try/catch) + audit خودمحدود (10MB) + بکاپِ خراب نوشته نمی‌شود + GC نگهبانِ رشد ⇒ **صفر crash/500** |

**تفاوتِ S1 با Wave 15:** SIGTERM ⇒ drain+persist ⇒ صفر loss (عملِ عادیِ ارکستراتور)؛ SIGKILL = تستِ **crash consistency** — هر دو مستند و قابلِ اندازه‌گیری.

**یافتهٔ صادقانه (در طرح §S2):** بعد از قطعِ طولانیِ Redis، `retryStrategy`ِ ioredis (3 تلاش) تمام شده و client بسته می‌ماند ⇒ **restart فرایند برایِ بازپس‌گیریِ Redis لازم** است (k8s: rolling restart پس از سلامتِ Redis). پیشنهادِ بهبود (خارجِ اسکوپ): retryStrategy پایدار.

## ۳. `tools/chaos-test.sh` — ابزارِ شبیه‌سازی

- **ایمنیِ سفت:** پیش‌فرض **DRY_RUN** (هیچ کارِ ویرانگری نمی‌کند — فقط طرح + اسکلتِ خروجی)؛ اجرایِ زنده فقط با `--live` + envهایِ الزامی (وگرنه خطا)؛ disk-full **سقفِ حجم** دارد و فایلِ پرکننده در بازگشت حذف می‌شود.
- **هر سناریو:** `snapshot before` (3 پروب: liveness/readiness/health) → تزریق → `timeline.csv` (هر 5 ثانیه: ts,endpoint,status,ms) → بازگشت → `snapshot after` → **summary.txt با PASS/FAIL خودکار** روی فرضیه‌ها (grep بر timeline).
- **خروجی:** `tests/chaos-output/` (در .gitignore) — 4 فایل برایِ هر سناریو.
- **ترافیکِ هم‌زمان:** `k6 run tests/performance/suites/chaos-redis-test.js` (فاز ۵) — thresholds: بدون 500 + p95<400 + صحتِ نشست.

## ۴. تست‌ها — `tests/wave19-chaos.js` (28/28 سبز)

- C1–C3: اسکریپت (وجود/shebang/`bash -n`) + `--help` (5 سناریو + مدلِ ایمنی) + **DRY_RUN همهٔ 5 سناریو** (exit 0 + 20 فایلِ خروجی + ساختارِ snapshot/timeline)
- C4: سند (5 سناریویِ الزامی + ارجاع به ابزار و k6 + pending + جدولِ پذیرش)
- C5: **سازگاریِ فرضیه‌ها با قوانینِ پروژه** (atomik store، mirror پیش از ack، fail-open، قراردادِ 503، صفر data loss×2، crash-free disk-full، محدودیتِ reconnect)
- C6: `tests/chaos-output/` در .gitignore
- C7: سوئیتِ k6ِ فاز ۵ سالم (thresholds + متریک‌ها)

## ۵. گیت‌ها + رگرسیون

| گیت | نتیجه |
|---|---|
| `tests/smoke.js` | **547/547** ✅ |
| `tools/check-authz.js` | **0** ✅ |
| `tests/secret-scan.js` | **11/11** ✅ |
| `build.js --check` | rc=0 ✅ |
| `tests/wave19-chaos.js` | **28/28** ✅ |
| رگرسیونِ سرور | لازم نبود — هیچ کدِ سروری دست نخورد (فقط ابزار/تست/مستندات) |

*یادداشت: در ابتدای این دور، .git یک‌بار به `2a2b74f` reset شده بود؛ چون کامیت‌ها روی GitHub سالم بودند، با fetch + `reset --hard ea24580` بازیابی شد (blob‌ها پیش از reset با hash-verify بررسی شده بودند) و smoke 547/547 تأییدِ یکسانیِ درخت را داد.*

## ۶. Commitها

| Commit | محتوا |
|---|---|
| `966d1bb` | feat(wave19): chaos-test.sh + WAVE19_CHAOS_PLAN.md + wave19-chaos.js + .gitignore |
| `ded2f91` | docs(wave19): AI_PROMPT 0.5.35 + ROADMAP B.8 + HANDOFF |
| (این گزارش) | docs: گزارشِ دور ۱۱۰ |

**تأییدیهٔ پوش:** خروجیِ `git ls-remote origin arena/01a08545-p2` در پیامِ تحویل (hashِ خودِ کامیتِ گزارش داخلِ فایل قابلِ ثبت نیست).

## ۷. نکات برایِ سوپروایزر

- **pending (ثبت‌شده در طرح §5):** اجرایِ LIVE نیازمندِ محیطِ چند-نمونهٔ زنده (API+Redis+PG + root برایِ tc/fallocate + k6) — «در انتظارِ زیرساخت».
- **پیشنهادِ فنی:** retryStrategyِ پایدار برایِ ioredis (بازپس‌گیریِ خودکارِ Redis بدونِ restart) — کاندیدایِ موجِ بعد.
- **با Go-Live:** چک‌لیستِ چک‌لیستِ پیش‌ازِ اجرا (plan §3) + دیسکِ ≥50GB با alert 80/90٪ (plan S5).
