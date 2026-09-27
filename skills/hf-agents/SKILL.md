---
name: hf-agents
description: Build multi-step autonomous agents with Hugging Face libraries — tool chains, model selection, and step-wise debugging.
version: 1.0.0
author: rezaa2544, Hermes Agent
license: MIT
platforms: [linux, macos, windows]
metadata:
  hermes:
    tags: [agents, huggingface, ai-engineering, multi-step, tools]
    related_skills: [prompt-engineering, llm-tools-anthropic, rag-langchain]
---

# Agents در Hugging Face (hf-agents)

این مهارت ساخت و استفاده از سیستم‌های خودکار چندمرحله‌ای (Agent) با کتابخانه‌های
Hugging Face را پوشش می‌دهد: ترکیب چند مدل، زنجیر تصمیم‌گیری خودکار و ابزارها.

## When to Use

- وقتی یک وظیفه نیاز به چند گام دارد: دریافت ورودی → پردازش → تصمیم →
  خروجی نهایی.
- ترکیب چند قابلیت (جستجوی وب، پایگاه داده، محاسبات) در یک جریان خودکار.
- Don't use for: وظایف تک‌مرحله‌ای ساده — یک LLM call ساده کافی است.
- Don't use for: جریانهایی که باید کاملاً قطعی باشند — خروجی agent احتمالی
  است.

## Prerequisites

- پایتون (>= 3.9).
- `pip install transformers` (یا `huggingface_hub`).
- آشنایی با `python-basics` و `prompt-engineering`.
- در صورت نیاز دسترسی به GPU یا inference endpoint.

## Procedure

1. **وظیفه را به گام‌ها تجزیه کن.** قبل از کدنویسی، هر گام و ورودی/خروجی
   آن را روی کاغذ بنویس.
2. **مدل/Agent را انتخاب کن.** بررسی کن که مدل انتخابی وظیفه را پشتیبانی
   می‌کند (text-generation، classification، embeddings).
3. **ابزارها را تعریف کن.** هر ابزار را با یک تابع ساده و یک description
   شفاف بساز (به tool-use در `llm-tools-anthropic` مراجعه کن).
4. **شرط پایان را مشخص کن.** حداکثر تعداد گامها و معیار موفقیت را صریح
   بنویس — نباید agent در یک حلقه بی‌نهایت گیر کند.
5. **خروجی هر گام را لاگ کن.** بدون دیدن خروجی میانی، debug غیرممکن است.
6. **استثناءها را مدیریت کن.** اگر یک گام شکست خورد: retry با fallback یا
   fail-closed، نه ادامه کورکورانه.
7. **تست کن.** با یک نمونه ساده شروع کن و پیچیدگی را تدریجاً اضافه کن.

## Pitfalls

- **نداشتن شرط پایان** → agent تا پایان context/زمان ادامه می‌دهد.
- **فراموش کردن مدیریت استثناء** → شکست یک گاب، کل زنجیره را از کار
  می‌اندازد.
- **اعتماد زودهنگام به خروجی** — هر گام را قبل از ادامه بررسی کن.
- **انتخاب مدل نامناسب** برای حجم یا زبان داده.
- **عدم لاگ خروجی گامها** — پیدا کردن منطق خطا غیرممکن می‌شود.

## Verification

- agent با یک ورودی نمونه به انتها می‌رسد (نه timeout، نه حلقه بی‌نهایت).
- خروجی هر گام در لاگ دیده می‌شود.
- خروجی نهایی با هدف تعریف‌شده همخوانی دارد.
- یک گام خطادار، مسیر fail-safe مشخصی را طی می‌کند.
