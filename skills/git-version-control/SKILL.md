---
name: git-version-control
description: Use Git effectively — branching, commits, merges, conflict resolution, and safe history management for team collaboration.
version: 1.0.0
author: rezaa2544, Hermes Agent
license: MIT
platforms: [linux, macos, windows]
metadata:
  hermes:
    tags: [git, version-control, collaboration, education]
    related_skills: [devops-cicd, code-review, software-security]
---

# کنترل نسخه با Git (git-version-control)

این مهارت استفاده از Git برای مدیریت تاریخچه کد، همکاری تیمی و حل تعارضات را
پوشش می‌دهد.

## When to Use

- هرگاه چند نفر روی یک مخزن کار می‌کنند یا نیاز به نگهداری سابقه کد داری.
- قبل و بعد از هر تغییر مهم (status، branch، HEAD).
- وقتی دو تغییر با هم تعارض دارند.
- Don't use for: فایلهای باینری بزرگ — از Git LFS استفاده کن.

## Quick Reference

```bash
git status                     # وضعیت فعلی
git branch                     # شاخه جاری
git rev-parse HEAD             # SHA فعلی
git log --oneline -10          # ۱۰ کامیت اخیر
git checkout -b <branch>       # شاخه جدید + جابجایی
git add <file>                 # اضافه به stage
git commit -m "msg"            # کامیت
git push origin <branch>       # ارسال به ریموت
git ls-remote origin           # تایید وضعیت ریموت
git diff                       # تغییرات کامیت‌نشده
git merge <branch>             # ادغام
```

## Procedure

1. **قبل از کار، وضعیت را بررسی کن.** `git status`، `git branch`،
   `git rev-parse HEAD`. هرگز وضعیت را حدس نزن.
2. **یک شاخه جداگانه بساز.** برای هر ویژگی یا رفع باگ: `git checkout -b
   <type>/<short-description>`.
3. **کامیت مرتب بنویس.** هر تغییر منطقی یک commit با پیام واضح. فرمت
   پیشنهادی: `type(scope): description`.
4. **قبل از ادغام، هماهنگ کن.** `git fetch` + `git rebase` یا `git merge`
   از شاخه هدف.
5. **تعارض را حل کن.** در صورت conflict، فایلهای مشکل‌دار را باز کن،
   تصمیم بگیر، تست کن، سپس `git add` + `git commit` (یا `--continue`).
6. **بعد از کار، وضعیت را دوباره بررسی کن.** HEAD، tests، CI، origin/main.
7. **در پروژه پایش — قوانین خاص:**
   - هر تغییر = کامیت جدا + push + تایید با `git ls-remote`
   - تا زمانی که sha در GitHub دیده نشود، push «انجام شده» نیست
   - `git add -A` بدون بررسی ممنوع
   - force-push / history rewrite ممنوع
   - توکن/کلید در repository ممنوع
   - branch protection روی `main` را در نظر بگیر

## Pitfalls

- **فراموش کردن `git pull` / `git fetch`** قبل از کار در شاخه مشترک.
- **کامیت بزرگ با تغییرات نامرتبط** — فهم تاریخچه را سخت می‌کند.
- **استفاده از `git add -A`** بدون بررسی اینکه چه چیزی stage می‌شود.
- **force push روی شاخه مشترک** — کار دیگران از بین می‌رود.
- **فراموش کردن بررسی `git status`** قبل از عملیات خطرناک.
- **رها کردن شاخههای قدیمی** — شاخه‌های بلااستفاده انباشته می‌شوند.

## Verification

- `git status` بعد از کار، تمیز است (یا تغییرات جدید کامیت شده‌اند).
- `git ls-remote origin` شاخه شما را با SHA درست نشان می‌دهد.
- `git log` پیامهای واضح و منطقی نشان می‌دهد.
- در صورت تعارض، حل آن با تست تأیید شده است.
