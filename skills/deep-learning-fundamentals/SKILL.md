---
name: deep-learning-fundamentals
description: Core deep learning concepts — neural networks, backpropagation, overfitting, and evaluation for building and tuning models.
version: 1.0.0
author: rezaa2544, Hermes Agent
license: MIT
platforms: [linux, macos, windows]
metadata:
  hermes:
    tags: [deep-learning, machine-learning, neural-networks, education]
    related_skills: [math-intuition-3b1b, python-basics, rag-langchain]
---

# یادگیری عمیق (deep-learning-fundamentals)

این مهارت مفاهیم بنیادین یادگیری عمیق و یادگیری ماشینی را پوشش می‌دهد — از
شبکه‌های عصبی ابتدایی تا جلوگیری از بیش‌برازش و ارزیابی مدل.

## When to Use

- وقتی می‌خواهی یک مدل یادگیری عمیق بسازی، آموزش دهی یا بهبود دهی.
- دیباگ یک مدل که خوب آموزش نمی‌بینید یا پیش‌بینی‌های نامنظ می‌دهد.
- درک نتایج و معیارهای یک گزارش مدل.
- Don't use for: مسائل کلاسیک آماری یا داده‌های کوچک — برای آن‌ها یک مدل
  ساده بهتر است.

## Prerequisites

- آشنایی با `python-basics` و ایده‌ای از `math-intuition-3b1b`.
- یک فریم‌ورک: PyTorch یا TensorFlow.
- داده آموزشی پاک‌سازی‌شده.

## Procedure

1. **داده را بشناس.** قبل از مدل، داده را کاوش کن: توزیع، نویز، مقادیر
   گمشده و سوگیری. داده بد = مدل بد.
2. **داده را تقسیم کن.** train / validation / test. هرگز روی test آموزش
   نده و hyperparameter را با validation تنظیم کن.
3. **معماری را انتخاب کن.**
   - داده جدولی: MLP / gradient boosting
   - تصویر: CNN
   - دنباله/متن: RNN، LSTM یا Transformer
4. **تابع هزینه و optimizer را تنظیم کن.** Cross-entropy برای classification،
   MSE برای regression؛ Adam نقطه شروع خوبی است.
5. **آموزش را با monitoring اجرا کن.** loss و accuracy را در هر epoch ذخیره
   کن (TensorBoard یا یک فایل CSV).
6. **بیش‌برازش را کنترل کن.** اگر loss validation بالا رفت در حالی که loss
   train پایین می‌آید: regularization، dropout، early stopping یا داده بیشتر.
7. **ارزیابی کن.** دقت کافی نیست — ماتریس درهم‌ریختگی، precision/recall،
   ROC-AUC و بررسی خطاهای فردی را انجام بده.
8. **پیاده‌سازی ساده را اجرا کن.** قبل از مدل پیچیده، یک baseline ابتدایی
   بساز تا بدانی مدل پیچیده ارزشش را دارد.

## Pitfalls

- **شروع با شبکه عمیق بدون درک مبانی** — نتیجه غیرقابل دیباگ.
- **عدم تقسیم داده** → ارزیابی نادرست (data leakage).
- **بیش‌برازش پنهان** — فقط accuracy train را نگاه نکن.
- **بیش‌برازش به validation** — hyperparameter را فقط با validation تنظیم نکن؛
   یک test set جداگانه نگه دار.
- **عدم normalization داده** — همیشه ورودی‌ها را scale کن.

## Verification

- مدل آموزش می‌بیند: loss train و validation هر دو کاهش می‌یابند.
- شکاف معقولی بین train و validation accuracy وجود دارد (نه ۱۰۰٪ در برابر
  ۵۰٪).
- معیارهای ارزیابی روی test set محاسبه و گزارش می‌شوند.
- چند نمونه از خطاهای مدل بررسی شده و قابل تفسیرند.
