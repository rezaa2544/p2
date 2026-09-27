---
name: design-patterns
description: Apply software design patterns — creational, structural, behavioral — to solve recurring design problems without over-engineering.
version: 1.0.0
author: rezaa2544, Hermes Agent
license: MIT
platforms: [linux, macos, windows]
metadata:
  hermes:
    tags: [design-patterns, architecture, code-quality, education]
    related_skills: [software-architecture, code-review, data-structures-algorithms]
---

# الگوهای طراحی نرم‌افزار (design-patterns)

این مهارت استفاده از راه‌حل‌های آماده و آزموده‌شده برای مشکلات تکرارشونده
طراحی نرم‌افزار را پوشش می‌دهد. الگوها «آبی‌نقشه»هایی هستند که می‌توانند
برای مسائل خاص شخصی‌سازی شوند.

## When to Use

- وقتی در طراحی کد با مشکلی روبرو می‌شوی که قبلاً حل شده (ساخت object،
  ارتباط بین کلاس‌ها، رفتار runtime).
- بازبینی یا refactor کدی که ساختارش قابل نگهداری نیست.
- Don't use for: مسائل ساده‌ای که طراحی اولیه آنها کافی است — استفاده
  افراطی از الگوها (over-engineering) هم بد است.

## Procedure

1. **مشکل را قبل از الگو شناسایی کن.** دقیقاً چه مشکلی داری؟ ساخت object؟
   ارتباط بین ماژول‌ها؟ رفتار runtime؟
2. **دسته را تعیین کن:**
   - **Creational:** نحوه ساخت object — Singleton، Factory، Builder،
     Prototype
   - **Structural:** ترکیب کلاسها/objectها — Adapter، Decorator، Facade،
     Proxy
   - **Behavioral:** تقسیم مسئولیت و ارتباط — Observer، Strategy، Command،
     State
3. **الگوی مناسب را انتخاب کن.** بر اساس مشکل، نه بر اساس محبوبیت.
4. **اعمال کن.** الگو را در کد پیاده کن، اما آن را به شرایط خاص پروژه
   تنظیم کن — الگو قانون سخت نیست.
5. **به الگوهای موجود پروژه نگاه کن.** قبل از اضافه کردن یک الگوی جدید،
   بررسی کن که آیا در codebase قبلاً راهی برای این مشکل وجود دارد
   (مثلاً در `server/` پروژه پایش).
6. **تست کن.** رفتار جدید را با یک تست مشخص تایید کن.
7. **درجه پیچیدگی را توجیه کن.** اگر الگو کد را پیچیده‌تر کرد بدون اینکه
   ارزش مشخصی بدهد، آن را حذف کن.

## Pitfalls

- **Overengineering:** اضافه کردن الگو به هر مسئله ساده.
- **انتخاب الگوی اشتباه** چون نامش آشناست، نه چون مشکل را حل می‌کند.
- **الگو را قانون سخت گرفتن** — انعطاف لازم است.
- **نادیده گرفتن الگوهای موجود** در codebase → دو راه مختلف برای یک کار.

## Verification

- مشکل اصلی واقعاً با الگو حل می‌شود (نه فقط اسم تخصصی روی کد گذاشتن).
- کد بعد از اعمال الگو، خواندن و نگهداری آن آسان‌تر است.
- یک تست جدید رفتار موردنظر را تایید می‌کند.
- یک همکار/agent دیگر می‌تواند بدون توضیح طولانی، هدف الگو را در کد ببیند.
