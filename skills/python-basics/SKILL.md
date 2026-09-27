---
name: python-basics
description: Core Python programming — variables, control flow, functions, data types, modules, and scripting fundamentals for automation and data tasks.
version: 1.0.0
author: rezaa2544, Hermes Agent
license: MIT
platforms: [linux, macos, windows]
metadata:
  hermes:
    tags: [python, programming, education, scripting, fundamentals]
    related_skills: [prompt-engineering, llm-tools-anthropic, rag-langchain, hf-agents]
---

# برنامه‌نویسی پایتون مقدماتی (python-basics)

این مهارت اصول پایه‌ای زبان پایتون را پوشش می‌دهد: متغیرها، ساختارهای کنترلی،
توابع، انواع داده‌ها و ماژول‌ها. هدف، داشتن یک پایه محکم برای نوشتن اسکریپت،
پردازش داده و کار با ابزارهای مبتنی بر پایتون است.

## When to Use

- نوشتن اسکریپت ساده یا خودکارسازی یک کار تکراری
- خواندن/نوشتن فایل، پردازش رشته یا داده‌های ساختاریافته
- استفاده به‌عنوان پیش‌نیاز مهارت‌های ML/AI (RAG، Agents، Deep Learning)
- نوشتن probe یا ابزار کمکی برای تست و evidence production
- Don't use for: منطق اصلی سرور پایش که JavaScript/Node.js است — اینجا پایتون
  فقط برای ابزارهای کمکی و analysis به کار می‌آید.

## Prerequisites

- مفسر پایتون (>= 3.9). بررسی: `terminal("python --version")` (در ویندوز ممکن است
  `python3` یا `py -3` باشد).
- یک ویرایشگر یا اجرای مستقیم از ترمینال.

## Quick Reference

```bash
python script.py          # اجرای یک فایل
python -m venv .venv      # ساخت محیط مجازی
python -c "print(1+1)"    # اجرای یک عبارت
pip install <pkg>         # نصب پکیج
```

## Procedure

1. **محیط را بررسی کن.** `terminal("python --version")` باید نسخه >= 3.9 برگرداند.
2. **سینتکس پایه را رعایت کن.** ایندنت (۴ فاصله) بلوک‌ها را تعریف می‌کند؛
   `:` بعد از `if`/`for`/`def`/`class` الزامی است.
3. **انواع داده اصلی:** `int`، `float`، `str`، `bool`، `list`، `tuple`، `dict`،
   `set`. برای ساختارهای کلید-مقدار از `dict` استفاده کن.
4. **ساختارهای کنترلی:** `if/elif/else`، `for`، `while`، `break/continue`،
   `try/except/finally`.
5. **توابع:** `def name(args):` با `return`. مقادیر پیش‌فرض، `*args` و `**kwargs`.
6. **ماژول‌ها:** `import os`، `import json`، `from pathlib import Path`. کد را به
   توابع کوچک تقسیم کن تا قابل تست و reuse باشد.
7. **کار با فایل:** `open(path, "r", encoding="utf-8")` یا `Path.read_text()`.
   همیشه `encoding="utf-8"` مشخص کن (مهم برای متن فارسی).
8. **خروجی را بررسی کن.** برنامه را با ورودی نمونه اجرا و خروجی را با مقدار
   انتظاری مقایسه کن.

## Pitfalls

- **ایندنت اشتباه** رایج‌ترین خطاست؛ یک فاصله اضافی در بلوک کافی است تا
  `IndentationError` بگیرد.
- **فراموش کردن `:`** بعد از `if`، `for`، `def`.
- **جمع رشته و عدد:** `"a" + 1` خطا می‌دهد؛ اول `str(1)` کن.
- **== برای مقایسه** و `is` فقط برای identity (مثل `is None`).
- **list قابل تغییر است:** `a = [1,2]; b = a; b.append(3)` روی `a` هم اثر می‌گذارد.
  برای کپی از `a.copy()` یا `a[:]` استفاده کن.
- **فراموش کردن `encoding="utf-8"`** در ویندوز باعث encoding غیرمنتظره می‌شود.

## Verification

- `python script.py` بدون خطا اجرا شود.
- خروجی برنامه روی ورودی نمونه با مقدار انتظاری همخوانی داشته باشد.
- اگر کد منطق حساسی دارد: یک تابع `assert` بنویس و `python -m pytest` اجرا کن.
