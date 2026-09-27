---
name: devops-cicd
description: Set up and maintain CI/CD pipelines — automated build, test, and deployment with quality gates and safe rollout strategies.
version: 1.0.0
author: rezaa2544, Hermes Agent
license: MIT
platforms: [linux, macos, windows]
metadata:
  hermes:
    tags: [devops, ci-cd, automation, deployment, education]
    related_skills: [qa-testing, git-version-control, cloud-docker-k8s]
---

# DevOps و CI/CD (devops-cicd)

این مهارت یکپارچه‌سازی مداوم کد و فرآیندهای تحویل خودکار را پوشش می‌دهد:
ابزارها و روش‌هایی که به تکرار سریع توسعه و ارائه ایمن کمک می‌کنند.

## When to Use

- راه‌اندازی یا بازبینی یک pipeline ساخت/تست/استقرار.
- وقتی CI مداوم شکسته یا کند است.
- استقرار خودکار با کاهش ریسک (zero-downtime، canary).
- Don't use for: پروژه‌های تک‌نفره بدون سرور — overhead ارزش ندارد.

## Prerequisites

- یک سیستم کنترل نسخه (Git) — مهارت `git-version-control`.
- یک سرویس CI (GitHub Actions، GitLab CI، Jenkins).
- آشنایی با `qa-testing`.

## Quick Reference

```bash
# GitHub Actions — مسیر استاندارد
.github/workflows/ci.yml
```

## Procedure

1. **کنترل نسخه را پایه بگیر.** هر تغییر منطقی یک commit با پیام واضح.
2. **pipeline را طراحی کن:**
   - Checkout → Install → Build → Test → Report
   - هر stage باید در صورت شکست، کل pipeline را متوقف کند (fail-fast).
3. **کیفیت تست را تضمین کن.** پوشش تست کافی (حداقل مسیرهای اصلی و خطا).
   تست نباید false-green باشد (assert واقعی، نه `assert(true)`).
4. **محیطهای جداگانه بساز.** dev / staging / prod. هرگز تغییر مستقیم
   روی prod بدون اعتبارسنجی.
5. **استقرار ایمن را انتخاب کن:**
   - **Rolling:** جایگزینی تدریجی نسخه قدیم
   - **Blue-Green:** دو محیط کامل، جابجایی ترافیک
   - **Canary:** درصد کوچکی از ترافیک به نسخه جدید
6. **manitoring را اضافه کن.** بعد از استقرار، خطاها و latency را زیر نظر
   بگیر؛ در صورت تشخیص مشکل، rollback کن.
7. **workflow را مستند کن.** نحوه اجرای دستی و عیب‌یابی pipeline.

## Pitfalls

- **تستهای خودکار را بی‌اهمیت جلوه دادن** — بدون تست، هر انتشار پرریسک است.
- **تست false-green** — تستی که چیزی را بررسی نمی‌کند ولی سبز است. خطرناک‌ترین
  حالت.
- **Pipeline کامل بدون fail-fast** — شکست یک stage نباید دیده نشود.
- **استقرار مستقیم روی prod** بدون staging یا canary.
- **عدم rollback plan** — هر استقرار باید مسیر برگشت داشته باشد.
- **در پروژه پایش:** CI فعلی دارای چکهای شکست‌خورده است (`build (22.x)`
  با `DATABASE_URL: unbound variable` و `STRICT — 3-AI Evidence Gate` با
  ۲۴۳ FAIL). قبل از افزودن قابلیت جدید، باید سبز شود.

## Verification

- pipeline روی یک commit نمونه اجرا می‌شود و نتیجه (success/failure) روشن است.
- یک تغییر خرابکننده باعث شکست pipeline می‌شود (نه سبز کاذب).
- فرآیند rollback مستند و قابل اجرا است.
- زمان کل pipeline معقول است (نه ۳۰ دقیقه برای یک تست ساده).
