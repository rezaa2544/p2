# 💰 پوشش هزینه — Cost Envelope

**نسخه:** ۱.۰.۰ | **تاریخ:** ۲۰۲۶-۰۹-۱۳ | **مالک:** چت ۱۰ (آرنا ۱۰)
**وضعیت:** مدل هزینه + اقتصاد واحد — قیمت‌های واقعی و متریک تولیدی **NOT-RUN** (نیازمند staging/تولید)
**مرجع‌ها:** [آمادگی عملیاتی](OPERATIONAL_READINESS.md) · [مدل ظرفیت](CAPACITY_MODEL.md) (پروفایل بار — تنها ورودی عددی) · [نقشهٔ گلوگاه](BOTTLENECK_MAP.md)

> **قاعدهٔ صداقت:** همهٔ ورودی‌های بار از [CAPACITY_MODEL §۱](CAPACITY_MODEL.md) نقل شده‌اند.
> قیمت واحد (P_*) **جای‌نگهدار** است و باید با فاکتور واقعی ارائه‌دهنده جایگزین شود؛
> تا آن روز، هیچ عدد «دلاری» در این سند ادعای واقعیت ندارد — فقط فرمول‌ها لازم‌الاجرا هستند.

---

## ۱) ورودی‌های بار (نقل از CAPACITY_MODEL — مصوب)

| سنجه | مقدار |
|---|---|
| کاربران ثبت‌شده (هدف ملی) | ۱۰٬۰۰۰٬۰۰۰ |
| DAU | ۶٬۰۰۰٬۰۰۰ |
| RPS پیک (صبح مهر) | ۲۰٬۰۰۰ |
| RPS میانگین | ≈ ۱٬۷۳۶ |
| درخواست روزانه | ≈ ۱۵۰ میلیون |
| writes/sec پیک | ۲٬۵۰۰ |
| رشد دادهٔ نوشتنی | ≈ ۳۳۸M رکورد/سال |
| ضریب پیک/میانگین | ≈ ۱۱٫۵× |

---

## ۲) مدل هزینه (فرمول‌ها — لازم‌الاجرا)

```text
C_total  = C_db + C_cache + C_queue + C_app + C_obs + C_net

C_db     = P_db_core  × cores_db(RPS_w, conn)  +  P_db_gb × GB_stored(رشد سالانه)
C_cache  = P_cache_gb × GB_redis(working_set)  +  P_cache_ops × ops/sec
C_queue  = P_q_msg    × msgs/sec               +  P_q_ret × GB_retained × days
C_app    = P_app_node × N_nodes(RPS_peak / 2000، سقف ۲۰ نود مصوب)
C_obs    = P_met × series(Prometheus) + P_log × GB_logs/day + P_trace × spans/day
C_net    = P_egress × GB_out(پاسخ‌ها + sync payload)
```

- `N_nodes`: توان فرضی هر نود ≈ ۲٬۰۰۰ RPS در p95 < ۳۰۰ms ([CAPACITY_MODEL](CAPACITY_MODEL.md)) — اثبات در Wave 18.
- سقف‌ها از همان سند: ۲۰ نود اپ؛ سیاست کش «بهبود استراتژی، نه افزایش هسته».
- هر جمله‌ای که با RPS پیک مقیاس می‌شود، با ضریب ۱۱٫۵× نسبت به میانگین حساس است (§۴).

---

## ۳) اقتصاد واحد (Unit Economics — فرمول + جای‌نگهدار)

| سنجه | فرمول | مقدار نمایشی* |
|---|---|---|
| cost/user/month | `C_total / DAU_monthly` | TBD |
| cost/request | `C_total / requests_month` | TBD |
| cost/GB stored | `(C_db_store + C_q_ret) / GB_total` | TBD |
| cost/sync | `C_queue_sync_share / syncs_month` | TBD |

\* نمایشی = با قیمت جای‌نگهدار؛ **نه قابل‌استناد، نه قابل‌گزارش به ذی‌نفع بیرونی.**

---

## ۴) پیش‌بینی مقیاس (Scaling Projections — ساختاری، نه دلاری)

رشد هر مؤلفه نسبت به مبنای ۱۰K کاربر (با فرض پروفایل بار ثابت به‌ازای کاربر):

| مقیاس | کاربران | RPS پیک (نسبی) | نود اپ (تخمین فرمولی) | رشد داده/سال (نسبی) | یادداشت |
|---|---|---|---|---|---|
| S | ۱۰K | ≈ ۲۰ | ۱ (+۱ standby) | ×۱ | کف زیرساخت (HA حداقل) غالب است، نه بار |
| M | ۱۰۰K | ≈ ۲۰۰ | ۱–۲ | ×۱۰ | همچنان کف HA غالب |
| L | ۱M | ≈ ۲٬۰۰۰ | ۲–۳ | ×۱۰۰ | شروع مقیاس واقعی |
| ملی | ۱۰M | ۲۰٬۰۰۰ (مصوب) | ≈ ۱۰–۱۲ + حاشیه تا سقف ۲۰ | ×۱۰۰۰ (≈ ۳۳۸M رکورد) | [CAPACITY_MODEL](CAPACITY_MODEL.md) |

- **هزینهٔ پیک (صبح مهر):** ضریب ۱۱٫۵× یعنی ظرفیتِ رزرو برای پیک ≈ ۱۰× میانگین بیکار می‌ماند در ۲۰ ساعت شبانه‌روز —
  کاندیدای اصلی بهینه‌سازی: autoscaling روزانه (NOT-RUN، نیازمند اثبات پایداری failover خودکار).
- **رشد داده:** ۳۳۸M رکورد/سال در مقیاس ملی → سیاست retention/partition (ابزار: `tools/partition-retention.js`) مستقیم روی C_db اثر دارد.

---

## ۵) فرصت‌های بهینه‌سازی (رتبه‌بندی‌شده با اثر فرمولی)

| # | فرصت | اثر روی | پیش‌شرط/مالک |
|---|---|---|---|
| ۱ | Autoscaling روزانه حول پنجرهٔ ۰۷–۰۹ | C_app (تا ~۵۰٪ در تئوری) | اثبات پایداری در Wave 18 — چت ۴ |
| ۲ | SQL-native reads (کاهش rows scanned) | C_db + C_app (نود کمتر برای همان RPS) | Wave 3 — چت ۱ |
| ۳ | Retention/partition تهاجمی‌تر | C_db_store | سیاست نگهداشت مصوب — چت ۱ |
| ۴ | نمونه‌برداری trace (sampling) + retention لاگ پلکانی | C_obs | [OBSERVABILITY_DEPLOYMENT](OBSERVABILITY_DEPLOYMENT.md) — چت ۴ |
| ۵ | فشرده‌سازی sync payload | C_net + C_queue | چت ۳ (بدون شکست سازگاری پروتکل) |

ممنوعه: «کش به‌جای درمان» (افزایش بی‌رویهٔ Redis برای پوشاندن N+1) — مغایر [CAPACITY_MODEL](CAPACITY_MODEL.md) و [BOTTLENECK_MAP](BOTTLENECK_MAP.md).

---

## ۶) NOT-RUN و قدم‌های بعدی

1. جایگزینی P_* با قیمت واقعی ارائه‌دهنده (نیازمند انتخاب vendor — تصمیم ناظر).
2. کالیبراسیون با متریک staging (Wave 18): RPS واقعی هر نود، working_set واقعی Redis، GB لاگ/روز واقعی.
3. بازبینی فصلی هم‌زمان با drill فصلی ([OPERATIONAL_READINESS §۷](OPERATIONAL_READINESS.md)).

---

## ۷) تاریخچهٔ نسخه

| نسخه | تاریخ | تغییر |
|---|---|---|
| ۱.۰.۰ | ۲۰۲۶-۰۹-۱۳ | نسخهٔ اولیه — چت ۱۰، دور ۱ (قیمت‌ها TBD) |
