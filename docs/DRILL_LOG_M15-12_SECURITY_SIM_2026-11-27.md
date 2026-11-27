# ران‌بوردِ M15-12-SIM — جایگزین‌های متن‌بازِ اسکن‌های امنیتی — ۲۰۲۶-۱۱-۲۶/۲۷

> **فرمانِ مالک:** شبیه‌سازی تا خریدِ فیزیکی. ردیف ۲۲ (اسکن‌های امنیتیِ فروشندگان) به‌جای خریدِ اشتراک‌ها، با معادل‌های OSS محلی/CI به‌صورت SIM-VERIFIED پوشش داده شد؛ اسکن‌های واقعیِ فروشندگان (Fortify / APIsec / Jscrambler) = تنها بخشِ مالک‌دارِ ردیف ۲۲/۳.

## ۱) SAST / SCA / Secret — تأییدشده (محلی + CI)
| گیت | وضعیت | مرجع |
|---|---|---|
| SAST (repo-native static) | ✅ سبز در CI روی HEAD | lane `security.yml` — ران‌های سبزِ 19358039/18208211 |
| SCA (`npm audit --omit=dev`) | ✅ صفر آسیب‌پذیریِ production | ثبتِ دورهٔ قبل — همین شاخه |
| Secret scan (`tests/secret-scan.js`) | ✅ 13/13 محلی + CI | SI-013 Option A |
| CodeQL / Defender / SecurityCodeScan | ✅ سبز در CI | همان ران‌ها |

## ۲) DAST (OWASP ZAP baseline) — CI ✅ / محلی = BLOCKED-محیطی با دیاگنوزِ کامل
- **CI lane `dast`** = سبز روی ران‌های HEAD (ZAP baseline واقعی در رانرِ لینوکس — رفرنسِ مخزنِ درست `zaproxy/action-baseline`، ثبتِ قبلی).
- **مانورِ محلیِ امشب** (`tools/dast-live.sh --live` + استیجینگِ production واقعی PG+Redis در `payesh_dast`):
  - بوتِ staging = **HTTP 200** (production + PG واقعی + Redis HA واقعی + JWT رندوم).
  - دو مانعِ ویندوزیِ محلی رفع شد (رفعِ درست، نه دورزدنِ گیت):
    1. مونتِ `/zap/wrk` در Git Bash = MSYS path-mangling → با `MSYS_NO_PATHCONV=1` اجرا شد.
    2. `--network=host` در Docker Desktop ویندوز = netnsِ ماشینِ VM نه میزبان → شرطِ `uname -s` در اسکریپت: لینوکس = همان مسیرِ CI؛ غیرلینوکس = پل + `--add-host=host.docker.internal:host-gateway` + `DAST_HOST=0.0.0.0` (پیش‌فرض = 127.0.0.1، رفتارِ CI دست‌نخورده). اتصالِ کانتینر→میزبان = **HTTP 200 تست شد**.
  - مانعِ باقی‌مانده = **ناپایداریِ موتورِ Docker Desktop امشب (۷ بار کرش/فلاپ)**: بوتِ staging وسطِ hydration با `Connection terminated unexpectedly` قطع می‌شود (psql داخلِ کانتینر سالم است؛ پورت-فورواردِ موتور وسطِ کار می‌افتد). این = **محدودیتِ محیط، نه شکافِ مخزن** — در CI همان مسیر سبز است.
- **نتیجه:** DAST = SIM-VERIFIED از مسیر CI؛ مانورِ محلی با رفعِ دو مانعِ ابزاری و دیاگنوزِ مانعِ سوم ثبت شد — با پایداریِ docker (یا سرورهای واقعی) فقط اجرا می‌شود، نه بازسازی.

## ۳) باقی‌ماندهٔ مالک (تغییرنیافته)
Fortify / APIsec / Jscrambler (اشتراک‌ها + secrets) — ردیف ۳؛ پس از تأمین، سیم‌کشی‌ها آماده است.
