# مدل قرارداد لایه رصدپذیری بلادرنگ و پایش تولید (P1-SC-03)
## Production Observability & Monitoring Data Contracts

**تاریخ سند:** ۲۰۲۶-۰۹-۱۸  
**نگارش:** ۱.۰.۰  
**وضعیت:** مصوب (Approved)  
**ماژول مرجع:** `server/monitoring/production-observability.js`  
**وب‌سرویس:** `GET /api/v1/system/observability-health`  

---

## ۱. مدل داده شناسنامه سلامت رصدپذیری تولید (`ObservabilityHealthSnapshot`)

```json
{
  "snapshot_id": "OBS-HLTH-101-e73b09",
  "phase": "PHASE_4",
  "scope": "PRODUCTION_OBSERVABILITY_LAYER",
  "status": "healthy",
  "timestamp": "2026-09-18T12:00:00.000Z",
  "school_id": 101,
  "region_id": 1,
  "services": {
    "database": "healthy",
    "redis": "healthy",
    "event_queue": "healthy",
    "api_gateway": "healthy"
  },
  "capacity": {
    "cpu": {
      "utilization_pct": 32.5,
      "cores_available": 4,
      "load_average": [0.5, 0.4, 0.3],
      "status": "NORMAL"
    },
    "memory": {
      "rss_bytes": 125829120,
      "heap_total_bytes": 83886080,
      "heap_used_bytes": 52428800,
      "external_bytes": 10485760,
      "heap_utilization_pct": 62.5,
      "status": "NORMAL"
    },
    "connections": {
      "active_connections": 280,
      "max_connections": 2000,
      "saturation_pct": 14.0,
      "status": "ACCEPTABLE"
    }
  },
  "metrics": {
    "application": {
      "status": "healthy",
      "request_rate_per_sec": 250,
      "total_requests": 10000,
      "error_count": 1,
      "error_rate": 0.0001,
      "latency_ms": {
        "p50": 18,
        "p95": 65,
        "p99": 140
      },
      "active_sessions": 1850,
      "api_saturation_ratio": 0.28,
      "slo_compliance": {
        "p99_under_1s": true,
        "error_rate_under_point_one_pct": true
      }
    },
    "database": {
      "status": "healthy",
      "connection_pool": {
        "active_connections": 22,
        "max_connections": 100,
        "utilization_ratio": 0.22,
        "state": "STABLE"
      },
      "slow_queries": {
        "slow_query_count": 0,
        "threshold_ms": 200,
        "top_patterns": []
      },
      "transaction_latency_ms": 12,
      "deadlocks": {
        "deadlock_count": 0,
        "last_deadlock_timestamp": null
      }
    },
    "queue": {
      "status": "healthy",
      "event_throughput_per_sec": 210,
      "consumer_lag": 8,
      "retry_rate": 0.005,
      "dead_letter_queue_size": 0,
      "pipeline_state": "STREAMING_NOMINAL"
    },
    "cache": {
      "status": "healthy",
      "hit_ratio": 0.88,
      "miss_ratio": 0.12,
      "eviction_rate_per_sec": 2,
      "memory_pressure_ratio": 0.42,
      "efficiency_grade": "EXCELLENT"
    }
  },
  "anomalies": [],
  "operational_alerts": [],
  "governance_and_invariants": {
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
      "fail_closed_error_codes": [
        "OBSERVABILITY_TENANT_ISOLATION_VIOLATION",
        "OBSERVABILITY_ROLE_ACCESS_DENIED"
      ],
      "enforced": true
    }
  }
}
```

---

## ۲. مدل هشدار عملیاتی تجویزی (`OperationalAlert`)

```json
{
  "alert_id": "ALT-8a1d2e5f",
  "severity": "WARNING",
  "category": "APPLICATION_LATENCY",
  "title": "هشدار عملیاتی: APPLICATION_LATENCY",
  "description": "افزایش تاخیر صدک ۹۹ فراتر از آستانه مجاز پایلوت ملی (۳۰۰ میلی‌ثانیه)",
  "suggested_remediation": "افزایش تعداد نمونه‌های سرور (Horizontal Pod Autoscaling) و بازبینی کوئری‌های پرمصرف",
  "governance": {
    "automated_decision": false,
    "automated_execution": false,
    "requires_human_approval": true
  }
}
```

---

## ۳. قرارداد وب‌سرویس RESTful API

### مسیر دسترسی:
`GET /api/v1/system/observability-health`

### پارامترهای کوئری:
| نام پارامتر | نوع | الزامی؟ | توضیحات |
|---|:---:|:---:|---|
| `school_id` | عدد صحیح | اختیاری* | شناسه مدرسه جهت دریافت گزارش سلامت رصدپذیری مدرسه اختصاصی |
| `region_id` | عدد صحیح | اختیاری* | شناسه منطقه برای دریافت گزارش تجمیعی رصدپذیری منطقه |

*\* حداقل یکی از دو پارامتر `school_id` یا `region_id` باید ارسال شود.*

### کدهای وضعیت و پاسخ‌ها:
- `200 OK`: ارائه موفقیت‌آمیز شناسنامه جامع سلامت رصدپذیری، شاخص‌های چهارگانه و وضعیت ظرفیت.
- `400 Bad Request`: در صورت عدم ارائه هر دو پارامتر `school_id` و `region_id`.
- `401 Unauthorized`: درخواست فاقد احراز هویت معتبر.
- `403 Forbidden`: نقض ایزولاسیون چندمستأجری (IDOR) یا نقش غیرمجاز:
  - `OBSERVABILITY_TENANT_ISOLATION_VIOLATION`
  - `OBSERVABILITY_ROLE_ACCESS_DENIED`
