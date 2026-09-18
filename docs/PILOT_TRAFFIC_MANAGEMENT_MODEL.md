# مدل قرارداد لایه استقرار پایلوت تولید و مدیریت ترافیک (P1-SC-05)
## Production Pilot Deployment & Traffic Management Data Contracts

**تاریخ سند:** ۲۰۲۶-۰۹-۱۸  
**نگارش:** ۱.۰.۰  
**وضعیت:** مصوب (Approved)  
**ماژول مرجع:** `server/deployment/pilot-traffic-management.js`  
**وب‌سرویس:** `GET /api/v1/system/pilot-deployment-health`  

---

## ۱. مدل داده شناسنامه سلامت استقرار پایلوت (`PilotDeploymentHealthSnapshot`)

```json
{
  "snapshot_id": "PLT-DPLY-101-7fa91c",
  "phase": "PHASE_4",
  "scope": "PRODUCTION_PILOT_TRAFFIC_MANAGEMENT_LAYER",
  "deployment": "READY",
  "pilot_stage": "LIMITED_SCHOOL",
  "timestamp": "2026-09-18T12:00:00.000Z",
  "school_id": 101,
  "region_id": 1,
  "traffic": {
    "allocated": 10,
    "percentage": 10,
    "routing_strategy": "TENANT_ALLOWLIST",
    "canary_cohorts": 4
  },
  "rollback": {
    "available": true,
    "strategy": "FAST_DRAIN_AND_TRAFFIC_SWITCH",
    "estimated_rollback_seconds": 30,
    "automated_execution": false,
    "requires_human_approval": true
  },
  "human_approval_required": true,
  "health_gates": {
    "overall_gate": "PASS",
    "gates_evaluated_count": 5,
    "gates": [
      {
        "name": "APPLICATION_ERROR_RATE",
        "status": "PASS",
        "threshold": "<= 0.01 (1%)",
        "observed_value": 0.0001,
        "source": "P1-SC-03_OBSERVABILITY"
      },
      {
        "name": "LATENCY_P99_THRESHOLD",
        "status": "PASS",
        "threshold": "<= 300ms (pilot SLO)",
        "observed_value": 140,
        "source": "P1-SC-03_OBSERVABILITY"
      },
      {
        "name": "EVENT_QUEUE_AND_DLQ_HEALTH",
        "status": "PASS",
        "threshold": "DLQ == 0 and Lag < 100",
        "observed_value": "DLQ: 0, Lag: 8",
        "source": "P1-SC-02_EVENT_PROCESSING"
      },
      {
        "name": "DISASTER_RECOVERY_AND_RPO",
        "status": "PASS",
        "threshold": "Backup Verified and RPO <= 300s",
        "observed_value": "Backup: true, RPO Compliant: true",
        "source": "P1-SC-04_DISASTER_RECOVERY"
      },
      {
        "name": "DATABASE_HIGH_AVAILABILITY",
        "status": "PASS",
        "threshold": "Standby Ready and Sync Nominal",
        "observed_value": "STANDBY_READY",
        "source": "P1-SC-04_HIGH_AVAILABILITY"
      }
    ]
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
        "PILOT_TENANT_ISOLATION_VIOLATION",
        "PILOT_ROLE_ACCESS_DENIED"
      ],
      "enforced": true
    }
  }
}
```

---

## ۲. قرارداد وب‌سرویس RESTful API

### مسیر دسترسی:
`GET /api/v1/system/pilot-deployment-health`

### پارامترهای کوئری:
| نام پارامتر | نوع | الزامی؟ | توضیحات |
|---|:---:|:---:|---|
| `school_id` | عدد صحیح | اختیاری* | شناسه مدرسه جهت دریافت گزارش سلامت استقرار مدرسه اختصاصی |
| `region_id` | عدد صحیح | اختیاری* | شناسه منطقه برای دریافت تابلوی منطقه‌ای استقرار |

*\* حداقل یکی از دو پارامتر `school_id` یا `region_id` باید ارسال شود.*

### کدهای وضعیت و پاسخ‌ها:
- `200 OK`: ارائه موفقیت‌آمیز وضعیت استقرار، درصد ترافیک، آمادگی رول‌بک و وضعیت دروازه‌های پنج‌گانه سلامت.
- `400 Bad Request`: در صورت عدم ارائه هر دو پارامتر `school_id` و `region_id`.
- `401 Unauthorized`: درخواست فاقد احراز هویت معتبر.
- `403 Forbidden`: نقض ایزولاسیون چندمستأجری (IDOR) یا نقش غیرمجاز:
  - `PILOT_TENANT_ISOLATION_VIOLATION`
  - `PILOT_ROLE_ACCESS_DENIED`
