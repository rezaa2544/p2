# مدل قرارداد لایه پایداری، پشتیبان‌گیری و بازیابی بحران (P1-SC-04)
## Disaster Recovery & High Availability Data Contracts

**تاریخ سند:** ۲۰۲۶-۰۹-۱۸  
**نگارش:** ۱.۰.۰  
**وضعیت:** مصوب (Approved)  
**ماژول مرجع:** `server/infrastructure/disaster-recovery.js`  
**وب‌سرویس:** `GET /api/v1/system/disaster-recovery-health`  

---

## ۱. مدل داده شناسنامه سلامت بازیابی بحران (`DisasterRecoveryHealthSnapshot`)

```json
{
  "snapshot_id": "DR-HLTH-101-b841a0",
  "phase": "PHASE_4",
  "scope": "DISASTER_RECOVERY_HIGH_AVAILABILITY_LAYER",
  "status": "healthy",
  "timestamp": "2026-09-18T12:00:00.000Z",
  "school_id": 101,
  "region_id": 1,
  "backup": {
    "last_success": "2026-09-18T11:58:00.000Z",
    "verified": true,
    "retention_days": 30,
    "components": {
      "postgres": {
        "verified": true,
        "wal_archiving": true,
        "checksum": "sha256-verified-postgres-backup-archive"
      },
      "redis": {
        "verified": true,
        "rdb_snapshot": true,
        "aof_persistence": true,
        "checksum": "sha256-verified-redis-snapshot-archive"
      },
      "configuration": {
        "verified": true,
        "schema_version": "012",
        "tls_cert_backed_up": true
      }
    }
  },
  "recovery": {
    "rpo": "120s",
    "rto": "240s",
    "rpo_policy": "<= 300s (5 min)",
    "rto_policy": "<= 900s (15 min)",
    "rpo_seconds": 120,
    "rto_seconds": 240,
    "rpo_compliant": true,
    "rto_compliant": true
  },
  "high_availability": {
    "database": "healthy",
    "cache": "healthy",
    "queue": "healthy",
    "failover_readiness": "STANDBY_READY"
  },
  "restore_rehearsal": {
    "drill_status": "PASSED",
    "rehearsal_timestamp": "2026-09-18T11:45:00.000Z",
    "duration_seconds": 145,
    "tables_restored": 38,
    "records_restored": 125000,
    "isolated_target": true,
    "data_corruption_detected": false,
    "verified": true
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
        "DR_TENANT_ISOLATION_VIOLATION",
        "DR_ROLE_ACCESS_DENIED"
      ],
      "enforced": true
    }
  }
}
```

---

## ۲. قرارداد وب‌سرویس RESTful API

### مسیر دسترسی:
`GET /api/v1/system/disaster-recovery-health`

### پارامترهای کوئری:
| نام پارامتر | نوع | الزامی؟ | توضیحات |
|---|:---:|:---:|---|
| `school_id` | عدد صحیح | اختیاری* | شناسه مدرسه جهت دریافت گزارش سلامت پشتیبان اختصاصی |
| `region_id` | عدد صحیح | اختیاری* | شناسه منطقه برای دریافت تابلوی منطقه‌ای پایداری |

*\* حداقل یکی از دو پارامتر `school_id` یا `region_id` باید ارسال شود.*

### کدهای وضعیت و پاسخ‌ها:
- `200 OK`: ارائه موفقیت‌آمیز شناسنامه جامع سلامت پشتیبان‌ها، مانور بازیابی، RPO/RTO و آمادگی Failover.
- `400 Bad Request`: در صورت عدم ارائه هر دو پارامتر `school_id` و `region_id`.
- `401 Unauthorized`: درخواست فاقد احراز هویت معتبر.
- `403 Forbidden`: نقض ایزولاسیون چندمستأجری (IDOR) یا نقش غیرمجاز:
  - `DR_TENANT_ISOLATION_VIOLATION`
  - `DR_ROLE_ACCESS_DENIED`
