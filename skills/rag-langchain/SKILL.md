---
name: rag-langchain
description: Build Retrieval-Augmented Generation systems with LangChain — indexing, embeddings, retrieval, and answer synthesis over external data.
version: 1.0.0
author: rezaa2544, Hermes Agent
license: MIT
platforms: [linux, macos, windows]
metadata:
  hermes:
    tags: [rag, langchain, llm, retrieval, embeddings, ai-engineering]
    related_skills: [prompt-engineering, llm-tools-anthropic, hf-agents]
---

# RAG با LangChain (rag-langchain)

این مهارت ساخت سیستمهای بازیابی اطلاعات (Retrieval Augmented Generation) را
با فریم‌ورک LangChain پوشش می‌دهد: به‌جای تکیه صرف بر حافظه مدل، از یک منبع
داده خارجی برای یافتن متن مرتبط استفاده می‌کنیم و سپس پاسخ نهایی را با آن
متن می‌سازیم.

## When to Use

- وقتی مدل باید بر اساس داده‌های بزرگ یا اختصاصی پاسخ دهد (مثلاً اسناد
  پروژه، پایگاه دانش، وب‌سایت).
- ساخت چتبات پرسش‌وجواب دانش‌بنیان.
- وقتی می‌خواهی پاسخها به منابع قابل استناد متصل باشند.
- Don't use for: پرسش‌های عمومی که مدل از قبل می‌داند، یا کارهایی که داده
  دقیق و قطعی نیاز دارند (آنها را با کد حل کن).

## Prerequisites

- پایتون (>= 3.9) + `pip install langchain langchain-community`.
- یک مدل embedding (OpenAI، Cohere یا یک مدل محلی) و کلید مربوطه.
- یک vector store (FAISS، Chroma یا pgvector).
- آشنایی با `python-basics` و `prompt-engineering`.

## Quick Reference

```python
from langchain_community.vectorstores import FAISS
from langchain_text_splitters import RecursiveCharacterTextSplitter
from langchain_core.documents import Document

# 1) Split
splitter = RecursiveCharacterTextSplitter(chunk_size=1000, chunk_overlap=200)
chunks = splitter.split_documents(docs)
# 2) Embed + Index
store = FAISS.from_documents(chunks, embedder)
# 3) Retrieve
hits = store.similarity_search(question, k=4)
# 4) Generate
answer = llm.invoke(prompt_with_context(question, hits))
```

## Procedure

1. **منبع داده را آماده کن.** متنها را تمیز کن (حذف نویز، یکدست کردن encoding
   به `utf-8`) و به اسناد ساختاریافته تبدیل کن.
2. **استراتژی chunking را انتخاب کن.** اندازه chunk و overlap را بر اساس
   ساختار متن تنظیم کن (مثلاً `chunk_size=1000`, `chunk_overlap=200`). اسناد
   فارسی را در مرزهای معنایی بشکن.
3. **مدل embedding را انتخاب کن.** باید از همان زبان/دومنه پشتیبانی کند.
   فارسی نیاز به یک embedder با پشتیبانی چندزبانه دارد.
4. **index بساز.** embeddingها را در یک vector store ذخیره کن و persistence
   آن را تضمین کن (نه در هر درخواست از نو).
5. **retrieval را پیاده کن.** `similarity_search(question, k=N)`؛ `k` را
   تنظیم کن و در صورت نیاز فیلتر/metadata اضافه کن.
6. **prompt نهایی را بساز.** متن بازیابی‌شده + سؤال کاربر را در یک template
   قرار بده و به LLM بده.
7. **کیفیت را ارزیابی کن.** چند سؤال نمونه را امتحان کن؛ آیا پاسخ واقعاً از
   متن بازیابی‌شده است؟ آیا منابع استناد می‌شوند؟

## Pitfalls

- **بهبود retrieval را فراموش کردن** — اگر سندی که باید پیدا شود پیدا
  نمی‌شود، عیب از embedding/`k`/metadata است، نه از LLM.
- **chunks خیلی بزرگ یا خیلی کوچک** → یا اطلاعات اضافه یا اطلاعات ناقص.
- **عدم استناد به منابع** — پاسخ بدون ذکر منبع ممکن است hallucination باشد.
- **RAG را لوله انتقال نادیده گرفتن** — خروجی نهایی را همیشه بررسی کن.
- **هزینه دوباره index کردن** — embeddingها را cache کن.
- **فارسی/RTL:** embedder باید از فارسی پشتیبانی کند، وگرنه کیفیت retrieval
  به‌شدت افت می‌کند.

## Verification

- برای ۳ پرسش نمونه، اسناد بازیابی‌شده واقعاً حاوی پاسخ هستند.
- پاسخ نهایی به منبع بازیابی‌شده استناد می‌کند.
- re-query با همان پرسش، همان اسناد را برمی‌گرداند (تکرارپذیری retrieval).
- یک پرسش خارج از دامنه به‌جای hallucination، «اطلاعاتی موجود نیست» برمی‌گرداند.
