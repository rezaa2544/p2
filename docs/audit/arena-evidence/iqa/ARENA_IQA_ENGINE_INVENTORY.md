# Inventory کامل ۲۱ موتور هوشمندی — ممیزی D1–D7 و دفتر ثابت‌ها

**پایه:** `main @ 66928be` · **شاخه:** `arena-iqa/engine-audit-20260923` · **کامیت‌ها:** `8ab817a` (IQA-01…08) + `871ff05` (IQA-09…11)
**سطح شواهد:** E3 (اجرای واقعی — Node v22.14.0، JSON store) · **حکم CERTIFIED: صادر نشده و نخواهد شد.**
**قاعده حاکم این دور:** هر سنجه‌ای که از constant/fallback بدون مبنای اندازه‌گیری واقعی تولید شود، defect است تا خلافش ثابت شود. سوئیپ کامل `?? <عدد>` / `|| <عدد>` روی هر ۲۱ موتور + لایه route انجام و تک‌تک موارد در دفتر بخش ۴ حکم گرفتند.

---

## ۱) جدول inventory — ۲۱ موتور × ۷ شرط داده

نماد: ✅ = سالم/پس از اصلاح سالم · 🔴→✅ = نقض بازتولیدشده و بسته‌شده · 🟠 = OPEN (نیازمند تصمیم Tech Lead) · − = فاقد موضوعیت
ستون HTTP: مسیر `/api/v1/analytics/…` (فقط EI-09…21 wired هستند؛ EI-01…08 هیچ مسیر HTTP ندارند — شکاف شناخته‌شده roadmap).

| EI | موتور | HTTP | D1 نرمال | D2 خالی | D3 null | D4 ناقص | D5 نامعتبر | D6 مرزی | D7 برون‌حوزه | حکم |
|---|---|---|---|---|---|---|---|---|---|---|
| 01 | semantic | ✗ | ✅ | ✅ NO_DATA | ✅ | ✅ | ✅ unclassified | ✅ 0و20 | ✅ throw | VERIFIED-E3 |
| 02 | student-timeline | ✗ | ✅ | ✅ | ✅ | ✅ | 🔴→✅ epoch-1970 حذف | ✅ | ✅ | VERIFIED-E3 |
| 03 | assessment-intelligence | ✗ | ✅ | ✅ | ✅ | ✅ | ✅ نمره نامعتبر حذف | ✅ | ✅ | VERIFIED-E3 |
| 04 | attendance-intelligence | ✗ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ throw | VERIFIED-E3 |
| 05 | school-health-dashboard | ✗ | ✅ | 🔴→✅ بود: 85.13 EXCELLENT | 🔴→✅ | ✅ | ✅ | ✅ | ✅ throw | VERIFIED-E3 |
| 06 | parent-360 | ✗ | ✅ | 🔴→✅ بود: حضور 100٪ | ✅ | ✅ | ✅ | ✅ | ✅ guard | VERIFIED-E3 |
| 07 | teacher-evidence | ✗ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ guard | VERIFIED-E3 |
| 08 | intervention-case-mgmt | ✗ | ✅ | 🔴→✅ بود: اثربخشی 1.0 | ✅ | 🔴→✅ سرکوب هشدار | ✅ transition | ✅ | ✅ throw | VERIFIED-E3 |
| 09 | school-intelligence-center | ✅ | ✅ | 🔴→✅ بود: سلامت 83.2 | 🔴→✅ | ✅ | ✅ 400 | ✅ | ✅ 403+بدون نشت | VERIFIED-E3 |
| 10 | regional-intelligence-network | ✅ | ✅ | 🔴→✅ بود: میانگین 90/15 | 🔴→✅ | 🔴→✅ مدرسه بی‌داده=HEALTHY | ✅ 400 | ✅ | ✅ 403 | VERIFIED-E3 |
| 11 | quality-governance | ✅ | ✅ | 🔴→✅ بود: شاخص 81.5 | 🔴→✅ | ✅ | ✅ 400/403 | ✅ | ✅ 403 | VERIFIED-E3 |
| 12 | longitudinal-monitoring | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ 400 | ✅ | ✅ 403 | VERIFIED-E3 |
| 13 | recommendation-action-planning | ✅ | ✅ | 🔴→✅ route ثابت 88.0 | 🔴→✅ | 🔴→✅ evidence جعلی 14.2 | ✅ 400/403 | ✅ | ✅ 403 | VERIFIED-E3* |
| 14 | intelligence-feedback-memory | ✅ | ✅ | 🔴→✅ ACT-DEFAULT-01 حذف | 🔴→✅ | ✅ دلتا=null | ✅ 400/403 | ✅ | ✅ 403 | PARTIAL |
| 15 | intelligence-governance-dashboard | ✅ | ✅ | 🔴→✅ ACT-DEF-01+92/98/95 حذف | 🔴→✅ | ✅ | ✅ 400/403 | ✅ | ✅ 403 | PARTIAL |
| 16 | policy-simulation-engine | ✅ | 🟠 | 🟠 baseline جعلی 87.5/15.2 | 🟠 | 🟠 | 🔴→✅ 400 | − | ✅ 403 | OPEN (synthetic) |
| 17 | decision-intelligence-command | ✅ | 🟠 | 🟠 ۲ تصمیم دمو DEC-SCH* | 🟠 | 🟠 | 🔴→✅ 400 | − | ✅ 403 | OPEN (synthetic) |
| 18 | operational-intelligence-execution | ✅ | 🟠 | 🟠 defaultWorkflow | 🟠 | 🟠 | 🔴→✅ بود: fail-open 200 | − | ✅ 403 | OPEN (synthetic) |
| 19 | outcome-evaluation-optimization | ✅ | 🟠 | 🟠 رکورد اثر جعلی 92.8 | 🟠 | 🟠 | 🔴→✅ بود: fail-open 200 | − | ✅ 403 | OPEN (synthetic) |
| 20 | intelligence-platform-integration | ✅ | 🟠 | 🟠 ثابت 86.5/84/81.2 | 🟠 | 🟠 | 🔴→✅ بود: fail-open 200 | − | ✅ 403 | OPEN (synthetic) |
| 21 | intelligence-release-certification | ✅ | 🟠 | 🟠 زنجیره با سیگنال 78.5/96.5 | 🟠 | 🟠 | 🔴→✅ بود: fail-open 200 | − | ✅ 401 | OPEN (E1/synthetic) |

\* EI-13: مسیر HTTP و موتور تولید پیشنهاد کاملاً پاکسازی شد؛ فقط `?? 90.0` خط :269 به‌عنوان مقایسه‌ی درون‌قاعده باقی است که با گاردهای null جدید هرگز فعال نمی‌شود (evidence هرگز مقدار جعلی حمل نمی‌کند).
🟠 برای EI-16…21: خروجی از داده عملیاتی تغذیه نمی‌شود؛ پاسخ HTTP اکنون `data_provenance: SYNTHETIC_BASELINE` با هشدار فارسی صریح دارد و ادعای سنجه واقعی نمی‌کند.

---

## ۲) حوزه‌های تمرکزی — نتیجه به تفکیک

| حوزه | نتیجه |
|---|---|
| **A-23** | شناسه در repo وجود ندارد (grep کامل). طبق تفسیر مصوب = ممیزی خصمانه fallbackها. حاصل: ۱۱ گروه defect (IQA-01…11)، همه با بازتولید breach روی baseline. |
| **No-data masking** | ۸ موتور فاقد masking بودند (EI-02/05/06/08/09/10/11 + لایه route EI-13/14/15) → همه اکنون null + بلوک `data_quality`/`NO_DATA` صریح. باتری ۲۶۳ سنجه pin کرده است. |
| **Fallback** | دفتر کامل بخش ۴: ۴۷ fallback عددی بررسی شد → ۲۹ defect (۲۱ بسته، ۸ در کلاس OPEN)، ۱۸ مجاز با دلیل. |
| **Metric correctness** | سنجه‌های تجمیعی با ورودی cross-check شدند (هیچ شمارنده‌ای بزرگ‌تر از ورودی نیست؛ میانگین منطقه‌ای mixed = دقیقاً میانگین مدارس دارای داده: pin شده 94.0/16.0). |
| **Timestamps** | جعل epoch-1970 در خط زمانی حذف شد؛ ثابت `2026-09-18` در مسیر HTTP با زمان واقعی جایگزین شد؛ ثابت‌های درون‌موتوری برای تست‌های determinism حفظ شدند (E3-note). |
| **Fingerprints** | فقط EI-21 fingerprint دارد: موجود، hex معتبر، بین دو اجرای یکسان قطعی. اما ورودی زنجیره synthetic است → اعتبار fingerprint در سطح E1 (سندی) باقی می‌ماند. |
| **HTTP wiring** | ۱۳ endpoint سالم (احراز 401، گارد 403، اعتبارسنجی 400)؛ fail-open NaN در ۴ endpoint بسته شد (بازتولید 200→400 ثبت). EI-01…08 بدون مسیر HTTP — شکاف wiring، NOT VERIFIED. |
| **Dashboard** | داشبورد مدیر (EI-09) دیگر برای مدرسه بی‌داده «سالم» نمایش نمی‌دهد؛ داشبورد سلامت (EI-05) سطح `NO_DATA` صریح دارد؛ مصرف‌کننده UI باید null-safe بخواند (پرچم برای Tech Lead). |
| **Regional aggregation** | **سه‌لایه اصلاح شد:** EI-09 district، EI-10 regional، EI-11 district-quality — مدرسه بی‌داده دیگر HEALTHY شمرده نمی‌شود و در میانگین وارد نمی‌شود؛ دو سنجه ثابت خالص (اثربخشی 0.85 و p-value 0.62) حذف شدند. |
| **Recommendation** | قواعد فقط با سیگنال اندازه‌گیری‌شده آتش می‌کنند؛ evidence پیشنهاد دیگر مقدار جعلی (chronic=14.2) حمل نمی‌کند؛ اثربخشی بدون خط مبنا = `NOT_MEASURABLE` نه دلتای جعلی. |

---

## ۳) دفتر یافته‌های این دور (IQA-09…11) — breach → fix → pin

| ID | Breach بازتولیدشده روی baseline | Fix | Pin در باتری |
|---|---|---|---|
| IQA-09 | منطقه با مدارس بی‌داده: `avg_attendance=90.0`، `avg_gpa=15.0`، `resolution=100.0`، `chronic=5.0`، روز اوج «wednesday» جعلی، مدرسه بی‌داده=HEALTHY؛ **دو ثابت خالص:** `effective_interventions_ratio=0.85/1.0` و `avg_difficulty_p_value=0.62/0.65` | میانگین فقط از مدارس دارای داده + `no_data_schools_count` + `data_coverage`؛ ثابت‌ها → null + `NOT_MEASURED` | PART D: ۶ سنجه |
| IQA-10 | حضور واقعی ۷۰٪ + chronic نامعلوم → evidence پیشنهاد `chronic=14.2` **جعلی** حمل می‌کرد؛ pre-baseline جعلی 85/12/14/60 → دلتای اثربخشی ساختگی | قواعد null-aware، evidence فقط real، `NOT_MEASURABLE` + `measured_deltas_count` | PART D: ۵ سنجه |
| IQA-11 | پیش‌فرض «سالمِ» `gpa=15/att=100` هشدار ترک‌تحصیل را **سرکوب** می‌کرد؛ خط مبنای جعلی 10.0/85.0 → `HIGHLY_EFFECTIVE` بدون اندازه‌گیری | قاعده بدون ورودی واقعی ارزیابی نمی‌شود ولی سیگنال واقعی همچنان آتش می‌کند؛ بدون baseline → `NOT_MEASURABLE` + `ESTABLISH_BASELINE_METRICS` | PART D: ۳ سنجه |

## ۴) دفتر ثابت‌ها/fallbackها (سوئیپ کامل — هر مورد با حکم)

**DEFECT — بسته‌شده (کامیت‌های 8ab817a + 871ff05):**
`15.0/95.0/5.0/100.0/78.5/size||1` (EI-09) · `100/85/85/80/0.5/0.1/90/5` (EI-05) · `80/85/85/80/80/70/50/75` رکن‌ها (EI-11) · `100.0` حضور (EI-06) · `1.0` اثربخشی و `0` نرخ حل (EI-08) · `15.0/100.0/10.0/85.0` early-warning/baseline (EI-08) · epoch-1970 (EI-02) · `90.0/15.0/100.0/5.0/0.85/0.62/wednesday/HEALTHY-default` (EI-10) · `90.0/14.2/5.0/15.0/0.05/85/12/14/60` (EI-13) · route-سطح: `88.0/80.0/14.5/14.5/0.08` (EI-13)، `ACT-DEFAULT-01+4.5/0.7/10.0` (EI-14)، `ACT-DEF-01+92/98/95/88/8.5` (EI-15)، `??90.0/5.0` district (EI-09) و `??75.0` district (EI-11)

**DEFECT — OPEN (کلاس synthetic، تصمیم Tech Lead، با provenance علامت‌گذاری شد):**
EI-16: `87.5/15.2/12.0/4/88.0/15.5/0.75` · EI-17: `||70/||60/||80` + ۲ تصمیم دمو · EI-18: defaultWorkflow · EI-19: رکوردهای اثر پیش‌فرض · EI-20: `86.5/84/81.2` · EI-21: `78.5/12.8/96.5/||101` · EI-14 درون‌موتور: `||100/||50` و اجزای بلوغ `50/50/100` · EI-15 درون‌موتور: `90/95/100/??100×3/92.0`

**JUSTIFIED — مجاز با دلیل:**
`max_score||20` (استاندارد نمره‌دهی ۲۰ در نبود سقف — در ۵ موتور) · `length||1` مخرج‌های تقسیم که صورتشان هم صفر است (گارد تقسیم‌برصفر، جعل تولید نمی‌کند) · `priorityWeight||9` (کلید sort، سنجه نیست) · `durationWeeks||8` (پارامتر سناریو در موتور OPEN) · `schoolId/regionId/district||1` (پیش‌فرض هویت — در مسیر HTTP با اعتبارسنجی 400 بی‌اثر شد؛ در فراخوانی مستقیم ماژول به‌عنوان ریسک باقی و ثبت است) · `user.region_id||1` در ۸ نقطه route (برچسب هویت منطقه — defect جزئی ثبت‌شده، سنجه نمی‌سازد)

## ۵) رگرسیون نهایی (روی 871ff05)

| سوئیت | نتیجه |
|---|---|
| باتری D1–D7 (+PART D) | **263/263** ✅ |
| لایه معنایی | **33/33** ✅ |
| tests/run.js | **35/35** ✅ |
| دودی | **547/547** ✅ |
| RESTful API | **31/31** ✅ |

## ۶) وضعیت انتشار

دو کامیت tests+fixes روی شاخه مستقل (`8ab817a`, `871ff05`) — FF تمیز از main. **Push نشده** (بدون credential + طبق دستور، push فقط با اعلام شما). هر دو patch در `arena_iqa_evidence/`. Merge فقط با تأیید Tech Lead — به‌ویژه: (۱) قرارداد null-های جدید برای مصرف‌کننده داشبورد، (۲) تصمیم درباره ۶ موتور synthetic (EI-16…21): اتصال pipeline واقعی یا خروج از سطح API.
