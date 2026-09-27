---
name: llm-tools-anthropic
description: Use Anthropic Claude APIs effectively — tool-use, long context, streaming, and structured outputs via the official SDK.
version: 1.0.0
author: rezaa2544, Hermes Agent
license: MIT
platforms: [linux, macos, windows]
metadata:
  hermes:
    tags: [llm, anthropic, claude, api, tool-use, ai-engineering]
    related_skills: [prompt-engineering, rag-langchain, hf-agents]
---

# ابزارهای LLM — Anthropic (llm-tools-anthropic)

این مهارت استفاده از قابلیت‌های پیشرفته مدل‌های Claude (Anthropic) را از طریق
API رسمی پوشش می‌دهد: tool-use، context طولانی، streaming و مدیریت خطا.

## When to Use

- وقتی می‌خواهی Claude را به یک ابزار خارجی (دیتابیس، جستجوی وب، اجرای کد)
  متصل کنی (tool-use).
- پردازش متن طولانی (اسناد، گزارشها) که از context معمولی فراتر است.
- تولید خروجی ساختاریافته (JSON) قابل استفاده در pipeline خودکار.
- Don't use for: کارهای قطعی و تکرارپذیر — برای آن‌ها کد بنویس.

## Prerequisites

- کلید API معتبر Anthropic (`ANTHROPIC_API_KEY`).
- کتابخانه رسمی: `pip install anthropic` (یا `@anthropic-ai/sdk` برای Node.js).
- مرور مستندات رسمی: https://docs.anthropic.com

## Quick Reference

```python
from anthropic import Anthropic
client = Anthropic()                      # ANTHROPIC_API_KEY از env
resp = client.messages.create(
    model="claude-sonnet-4-20250514",
    max_tokens=1024,
    messages=[{"role": "user", "content": "..."}],
)
print(resp.content[0].text)
```

## Procedure

1. **کلید را از env بخوان.** هرگز کلید را در کد هاردکد نکن — `ANTHROPIC_API_KEY`
   را از متغیر محیطی بخوان (قانون Secret Management پروژه).
2. **مدل مناسب را انتخاب کن.** بررسی کن مدلِ در حال استفاده هنوز پشتیبانی
   می‌شود و طول context آن برای ورودی کافی است.
3. **پیام را بساز.** system prompt را جدا از `messages` قرار بده؛ نقش و قالب
   خروجی را در همان ابتدا تعیین کن.
4. **در صورت نیاز tool-use را فعال کن.** ابزارها را به‌صورت schema تعریف کن
   (`name`, `description`, `input_schema`) و اگر مدل درخواست فراخوانی ابزار
   داد، آن را اجرا و نتیجه را برگردان.
5. **خطاها را مدیریت کن.** timeout، rate limit (429)، context overflow و
   خروجی نامعتبر را catch کن و یک رفتار fail-safe تعیین کن.
6. **خروجی را validate کن.** اگر JSON خواستی، آن را parse کن؛ اگر شکسته بود،
   retry یا fallback اجرا کن.

## Pitfalls

- **فرض اینکه مدل ابزارها را درست فراخوانی می‌کند** — همیشه پارامترهای
  ورودی ابزار را بررسی کن.
- **تجاوز از محدودیت context** → خطا یا برش خاموش. ورودی را قبل از ارسال
  size-check کن.
- **هاردکد کردن کلید** — این یک نقض امنیتی پروژه است (`.gitignore` شامل
  `.env` است).
- **عدم مدیریت rate limit** — درخواستهای متوالی بدون retry/backoff مسدود
  می‌شوند.
- **اعتماد به خروجی بدون validation** — مخصوصاً برای ساختار JSON.

## Verification

- درخواست نمونه بدون خطا اجرا و خروجی برمی‌گردد.
- اگر tool-use داریم: حداقل یک فراخوانی ابزار اجرا و نتیجه آن در مکالمه
  منعکس می‌شود.
- خروجی JSON با schema موردنظر parse می‌شود.
- یک مسیر خطا (مثلاً کلید نامعتبر) به‌درستی catch می‌شود.
