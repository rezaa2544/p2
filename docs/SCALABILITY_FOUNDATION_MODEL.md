# مدل قرارداد لایه زیرساخت مقیاس‌پذیری و آمادگی تولید (P1-SC-01)
## Distributed Scalability Foundation & Production Readiness Data Contracts

**تاریخ سند:** ۲۰۲۶-۰۹-۱۸  
**نگارش:** ۱.۰.۰  
**وضعیت:** مصوب (Approved)  
**ماژول مرجع:** `server/infrastructure/scalability-foundation.js`  
**وب‌سرویس:** `GET /api/v1/system/scalability-health`  

---

## ۱. مدل داده سلامت کش توزیع‌شده (`CacheHealthSnapshot`)

```json
{
  "total_requests": 10000,
  "hits": 8500,
  "misses": 1500,
  "l1_hits": 6000,
  "l2_hits": 2500,
  "hit_ratio_percent": 85.0,
  "miss_ratio_percent": 15.0,
  "l1_ratio_percent": 60.0,
  "l2_ratio_percent": 25.0,
  "evictions": 120,
  "invalidations": 350,
  "latencies": {
    "avg_l1_ms": 0.05,
    "avg_l2_ms": 0.95,
    "avg_cache_ms": 0.315,
    "avg_db_ms": 18.5,
    "latency_saved_ms_per_request": 15.457
  },
  "efficiency_score": 80.6,
  "health_status": "OPTIMAL",
  "tenant_namespace_strategy": "ISOLATED_PREFIX_WITH_EPOCH",
  "stampede_protection": "SINGLE_FLIGHT_MUTEX"
}
```

### فیلدها و تعاریف:
- `total_requests`: مجموع کل درخواست‌های خواندن در پنجره زمانی.
- `hit_ratio_percent`: درصد کل موفقیت در کش (`(hits / total) * 100`).
- `l1_ratio_percent`: نسبت برخوردهای پاسخ‌داده‌شده توسط کش محلی فرآیند.
- `l2_ratio_percent`: نسبت برخوردهای پاسخ‌داده‌شده توسط کلاستر توزیع‌شده ردیس.
- `latency_saved_ms_per_request`: میانگین تاخیر صرفه‌جویی‌شده بر هر درخواست نسبت به کوئری مستقیم پایگاه داده.
- `health_status`: وضعیت سلامت بر مبنای نرخ برخورد (`OPTIMAL`: $\ge 80\%$, `ADEQUATE`: $60-80\%$, `DEGRADED`: $40-60\%$, `CRITICAL`: $<40\%$).

---

## ۲. مدل داده شناسنامه آمادگی عملیاتی تولید (`ProductionReadinessReport`)

```json
{
  "report_id": "READINESS-PHASE4-101-k8s92a",
  "phase": "PHASE_4",
  "scope": "DISTRIBUTED_SCALABILITY_FOUNDATION",
  "school_id": 101,
  "region_id": 1,
  "production_readiness_status": "PRODUCTION_READY",
  "horizontal_scaling_architecture": {
    "stateless_request_boundary": true,
    "distributed_session_handling": "JWT_BEARER_WITH_REVOCATION_LIST",
    "database_source_of_truth": "POSTGRESQL_FAIL_CLOSED_IN_PRODUCTION",
    "cluster_safe": true
  },
  "distributed_cache_infrastructure": {
    "cache_strategy": "MULTI_TIER_L1_LRU_AND_L2_REDIS",
    "tenant_isolation_scheme": "TENANT_PREFIX_NAMESPACE_ENFORCED",
    "sample_tenant_key": "payesh:t:101:bootstrap:u:101",
    "efficiency": { "$ref": "#/definitions/CacheHealthSnapshot" }
  },
  "scalability_bottlenecks": {
    "total_bottlenecks": 0,
    "highest_severity": "NONE",
    "status": "OPTIMAL",
    "bottlenecks_detected": [],
    "dimensions_evaluated": [
      "DATABASE_POOL",
      "EVENT_PIPELINE",
      "NODE_MEMORY",
      "STATELESSNESS_BOUNDARY",
      "TENANT_ISOLATION_LEAKS"
    ]
  },
  "governance_and_compliance": {
    "human_decision_sovereignty": {
      "automated_decision": false,
      "automated_execution": false,
      "requires_human_approval": true,
      "enforced": true
    },
    "zero_ranking_guarantee": {
      "rank_prohibited": true,
      "ranking_score_prohibited": true,
      "league_table_prohibited": true,
      "best_school_prohibited": true,
      "worst_school_prohibited": true,
      "evaluation_nature": "IPSATIVE",
      "enforced": true
    },
    "tenant_isolation": {
      "scheme": "FAIL_CLOSED_WITH_STRICT_REGION_AND_SCHOOL_BOUNDS",
      "enforced": true
    }
  },
  "evaluated_at": "2026-09-18T12:00:00.000Z"
}
```

---

## ۳. قرارداد وب‌سرویس RESTful API

### مسیر دسترسی:
`GET /api/v1/system/scalability-health`

### پارامترهای کوئری:
| نام پارامتر | نوع | الزامی؟ | توضیحات |
|---|:---:|:---:|---|
| `school_id` | عدد صحیح | اختیاری* | شناسه مدرسه جهت دریافت گزارش اختصاصی |
| `region_id` | عدد صحیح | اختیاری* | شناسه منطقه برای دریافت نمای تجمیعی |

*\* حداقل یکی از دو پارامتر `school_id` یا `region_id` باید ارائه شود.*

### کدهای وضعیت و پاسخ‌ها:
- `200 OK`: ارائه موفقیت‌آمیز شناسنامه سلامت و آمادگی مقیاس‌پذیری.
- `400 Bad Request`: در صورت عدم ارائه `school_id` و `region_id`.
- `401 Unauthorized`: درخواست فاقد توکن یا نشست معتبر.
- `403 Forbidden`: نقض ایزولاسیون چندمستأجری (IDOR) یا نقش غیرمجاز:
  - `INFRASTRUCTURE_TENANT_ISOLATION_VIOLATION`
  - `INFRASTRUCTURE_ROLE_ACCESS_DENIED`
