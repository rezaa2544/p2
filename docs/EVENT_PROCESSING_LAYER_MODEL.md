# مدل قرارداد لایه پردازش رویدادهای غیرهمگام و مدیریت بار (P1-SC-02)
## Distributed Event Processing & Load Management Data Contracts

**تاریخ سند:** ۲۰۲۶-۰۹-۱۸  
**نگارش:** ۱.۰.۰  
**وضعیت:** مصوب (Approved)  
**ماژول مرجع:** `server/infrastructure/event-processing-layer.js`  
**وب‌سرویس:** `GET /api/v1/system/event-processing-health`  

---

## ۱. پاکت استاندارد رویداد دامنه (`DomainEventEnvelope`)

```json
{
  "event_id": "EVT-mu6r097x-0c15cd08",
  "type": "student.grade_recorded",
  "school_id": 101,
  "region_id": 1,
  "entity_id": "501",
  "idempotency_key": "idem:student.grade_recorded:101:501:2026-09-18T12:00:00.000Z",
  "payload": {
    "student_id": 501,
    "course_id": 12,
    "score": 18.5,
    "ipsative_growth_delta": 1.5
  },
  "status": "PENDING",
  "retry_count": 0,
  "max_retries": 3,
  "correlation_id": "CORR-EVT-mu6r097x-0c15cd08",
  "governance": {
    "automated_decision": false,
    "automated_execution": false,
    "requires_human_approval": true
  },
  "published_at": "2026-09-18T12:00:00.000Z"
}
```

### فیلدها و تعاریف:
- `event_id`: شناسه یکتا و برگشت‌ناپذیر رویداد در صف.
- `idempotency_key`: کلید مهار تکرار، جهت تضمین یکتایی و بی‌اثر بودن مصرف تکراری.
- `school_id`: شناسه مدرسه جهت اعمال عایق‌بندی چندمستأجری.
- `status`: وضعیت چرخه حیات رویداد (`PENDING`, `PROCESSING`, `PROCESSED`, `FAILED_RETRYABLE`, `DEAD_LETTER`).
- `governance`: شروط صلب حاکمیت تصمیم انسانی بر پیام.

---

## ۲. مدل داده شناسنامه سلامت پردازش رویدادها (`EventProcessingHealthSnapshot`)

```json
{
  "snapshot_id": "EVT-HLTH-101-k93bca",
  "phase": "PHASE_4",
  "scope": "DISTRIBUTED_EVENT_PROCESSING_LAYER",
  "school_id": 101,
  "region_id": 1,
  "pipeline_status": "OPERATIONAL",
  "queue_analysis": {
    "queue_health": "HEALTHY",
    "pending_count": 24,
    "processing_count": 8,
    "dlq_count": 0,
    "throughput": {
      "inflow_rate_per_sec": 180,
      "outflow_rate_per_sec": 210,
      "processing_efficiency_ratio": 1.17
    },
    "bottlenecks_detected": []
  },
  "registered_handlers_count": 6,
  "idempotent_consumer_registry": {
    "total_processed_keys": 1420,
    "deduplication_scheme": "IDEMPOTENCY_KEY_MUTEX_CACHE"
  },
  "dead_letter_queue_summary": {
    "dlq_depth": 0,
    "sample_records": []
  },
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
        "EVENT_PROCESSING_TENANT_ISOLATION_VIOLATION",
        "EVENT_PROCESSING_ROLE_ACCESS_DENIED"
      ],
      "enforced": true
    }
  },
  "evaluated_at": "2026-09-18T12:00:00.000Z"
}
```

---

## ۳. قرارداد وب‌سرویس RESTful API

### مسیر دسترسی:
`GET /api/v1/system/event-processing-health`

### پارامترهای کوئری:
| نام پارامتر | نوع | الزامی؟ | توضیحات |
|---|:---:|:---:|---|
| `school_id` | عدد صحیح | اختیاری* | شناسه مدرسه جهت دریافت گزارش صف اختصاصی |
| `region_id` | عدد صحیح | اختیاری* | شناسه منطقه برای دریافت تابلوی منطقه‌ای |

*\* حداقل یکی از دو پارامتر `school_id` یا `region_id` باید ارائه شود.*

### کدهای وضعیت و پاسخ‌ها:
- `200 OK`: ارائه موفقیت‌آمیز شناسنامه سلامت صف و آمار مصرف رویدادها.
- `400 Bad Request`: در صورت عدم ارائه `school_id` و `region_id`.
- `401 Unauthorized`: درخواست فاقد احراز هویت معتبر.
- `403 Forbidden`: نقض ایزولاسیون چندمستأجری (IDOR) یا نقش غیرمجاز:
  - `EVENT_PROCESSING_TENANT_ISOLATION_VIOLATION`
  - `EVENT_PROCESSING_ROLE_ACCESS_DENIED`
