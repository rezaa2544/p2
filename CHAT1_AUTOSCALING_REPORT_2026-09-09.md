# گزارشِ چت ۱ — Kubernetes/ECS Auto-Scaling (Tier 2، اولویت ۱) — ۱۹/۰۶/۱۴۰۵ (2026-09-09)

> شاخه: `arena/01a0827b-p2` · پوش شده · درخت تمیز · صفر تغییر در `src/` و `server/`.

## ۱. جدولِ کامیت‌ها

| # | موضوع | کامیت | پیام |
|---|---|---|---|
| ۱ | وظیفه (پیامِ دقیقِ درخواستی) | `7bea635` | `feat(infra): implement kubernetes auto-scaling` |
| ۲ | همین گزارش | (کامیتِ گزارش) | `docs: add chat 1 autoscaling report` |

## ۲. چه ساخته شد (POC — بدونِ کلاسترِ واقعی)

- `docs/AUTO_SCALING_SETUP.md` (تازه): §۰ پنج پیش‌نیازِ اجباری (P1 استورِ PG، P2 ‏REDIS_URL‏ مشترک،
  P3 خروجِ OTP/ریت‌لیمیت/jti از فایل، P4 اندپوینتِ `/metrics`، P5 مانیفست‌هایِ workload) + §۱-۱ (انتخابِ k8s) +
  §۱-۲ (جدولِ ۴ متریکه با ستونِ وضعیت) + §۱-۳ (HPA) + §۱-۴ (VPA) + §۱-۵ (ران‌بوکِ ۳ تستِ کلاستری) + چک‌لیست + §۴.
- `k8s/hpa-payesh-api.yaml`: HPA واقعی — ‏min3/max20‏، ‏cpu/70‏، ‏memory/80‏،
  ‏`http_requests_queue_length`/1000‏، ‏scaleDown.stabilizationWindowSeconds: 300‏ (cooldown پنج‌دقیقه).
- `k8s/hpa-payesh-redis.yaml` و `k8s/hpa-payesh-postgres.yaml`: عمداً `min=max=1` با کامنتِ
  «stateful با HPA اسکیل نمی‌شود» (اهرمِ واقعی: VPA + runbook دستی).
- `tests/hpa.js` ‏۶/۶‏ + `tests/hpa-mutations.js` ‏۲/۲‏ کشته (گاردِ ضدِ رانشِ آستانه‌ها و قفل‌ها).
- ارجاع‌ها: `DEPLOY.md` (§۹ + §۶-ب) و یک خط در `CANARY_DEPLOYMENT.md` §۱-۵.

## ۳. تصمیم‌هایِ صادقانه (انحرافِ عمدی از پرامپتِ خام)

| موردِ پرامپت | آنچه شد | چرا |
|---|---|---|
| متریکِ `redis_queue_depth > 5000` | فقط رزروِ جدول (§۱-۲)، نه YAML | صفِ job در Redis نداریم؛ HPA با متریکِ ناموجود خطا می‌گیرد |
| متریکِ سفارشیِ صف در HPA | در YAML هست، با وضعیتِ «تا P4 بی‌اثر» | اندپوینتِ `/metrics` در اپ نیست (کدِ آینده، ثبت در P4) |
| HPA برایِ redis/postgres | قفلِ ۱/۱ + VPA در §۱-۴ | stateful تک-primary با HPA اسکیل نمی‌شود (ضدِ الگو) |
| VPA + HPA هم‌زمان | ممنوع شد (§۱-۴) | نوسانِ دو کنترلر رویِ یک متریک |
| `maxReplicas: 20` | با قاعدهٔ «تا P1+P2+P3 عملاً ۱» | رپلیکایِ ۲+ رویِ استورِ فعلی = split-brain (‏otp.json‏، ‏`__auth`‏، ‏`__revoked_jti`‏) |

## ۴. راستی‌آزمایی (رویِ همین شاخه، بدونِ کلاستر)

| بررسی | نتیجه |
|---|---|
| پارسِ YAML هر ۳ مانیفست (js-yaml موقت، بدونِ تغییرِ `package.json`) | ✅ kind/replica درست |
| `tests/hpa.js` | ‏۶/۶‏ ✅ |
| `tests/hpa-mutations.js` | ‏۲/۲‏ کشته ✅ |
| `node tests/smoke.js` | ‏۵۴۷/۵۴۷‏ ✅ |
| `node tools/check-authz.js` | ‏۰‏ ✅ |
| `node tools/secret-scan.js` | ‏۱۱/۱۱‏ ✅ |
| `kubectl apply --dry-run` | ⏭️ اجرا نشد (نبودِ باینری — ثبت، نه ادعا) |

## ۵. Follow-upها (خارج از دامنهٔ POC)

1. P1 تا P5 (§۰ سند) — به‌ویژه P3 (کدِ اپ) و P4 (اندپوینتِ `/metrics`) و P5 (مانیفست‌هایِ workload).
2. اجرایِ ۳ تستِ §۱-۵ رویِ staging پس از آماده‌شدنِ کلاستر + بایگانیِ `describe hpa`.
3. تصمیمِ مالکِ محصول: k8s خودگردان یا ECS (سند k8s را پیشنهاد می‌دهد ولی ECS را رد نمی‌کند).
