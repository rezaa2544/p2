# مدل قرارداد لایه امنیت Zero Trust و انطباق زمان اجرا (P1-SC-06)
## Zero Trust Runtime Security & Compliance Data Contracts

**تاریخ سند:** ۲۰۲۶-۰۹-۱۸  
**نگارش:** ۱.۰.۰  
**وضعیت:** مصوب (Approved)  
**ماژول مرجع:** `server/security/`  
**وب‌سرویس:** `GET /api/v1/system/security-health`  

---

## ۱. مدل داده شناسنامه سلامت امنیت Zero Trust (`SecurityHealthSnapshot`)

```json
{
  "snapshot_id": "SEC-ZT-101-7fa91c",
  "timestamp": "2026-09-18T12:00:00.000Z",
  "school_id": 101,
  "region_id": null,
  "security_status": "HEALTHY",
  "zero_trust": {
    "enabled": true,
    "policy_engine": "ACTIVE",
    "runtime_protection": "ENABLED",
    "identity_verification": "ACTIVE",
    "session_protection": "ACTIVE",
    "access_boundary": "FAIL_CLOSED"
  },
  "governance": {
    "human_decision_sovereignty": true,
    "zero_ranking_guarantee": true,
    "tenant_isolation": true
  },
  "requires_human_approval": true,
  "governance_and_invariants": {
    "human_decision_sovereignty": {
      "automated_decision": false,
      "automated_execution": false,
      "requires_human_approval": true,
      "workflow": "DETECT -> REPORT -> HUMAN APPROVAL -> EXECUTE",
      "enforced": true
    },
    "zero_ranking_guarantee": {
      "rank_prohibited": true,
      "ranking_score_prohibited": true,
      "league_table_prohibited": true,
      "best_school_prohibited": true,
      "worst_school_prohibited": true,
      "compare_school_prohibited": true,
      "top_school_prohibited": true,
      "evaluation_nature": "IPSATIVE",
      "enforced": true
    },
    "tenant_isolation": {
      "fail_closed_error_codes": [
        "ZERO_TRUST_TENANT_ISOLATION_VIOLATION",
        "ZERO_TRUST_ROLE_ACCESS_DENIED",
        "ZERO_TRUST_CONTEXT_INVALID",
        "ZERO_TRUST_POLICY_REQUIRED"
      ],
      "enforced": true
    }
  }
}
```

---

## ۲. قرارداد تصمیم‌گیری موتور سیاست امنیتی (`PolicyDecisionResult`)

```json
{
  "decision": "ALLOW",
  "reason": "دسترسی مجاز مطابق خط‌مشی احراز هویت‌شده سازمانی.",
  "policy_id": "POL-USER-USER_READ-a8f3b2",
  "requires_human_approval": true
}
```

در موارد عملیات پرریسک:
```json
{
  "decision": "REVIEW",
  "reason": "اقدام امنیتی حساس BULK_USER_EXPORT جهت اجرا نیازمند بررسی و تأیید صریح مدیر ارشد انسانی است.",
  "policy_id": "POL-SECURITY-BULK_USER_EXPORT-4e12c0",
  "requires_human_approval": true
}
```

---

## ۳. قرارداد وب‌سرویس RESTful API

### مسیر دسترسی:
`GET /api/v1/system/security-health`

### پارامترهای کوئری:
| نام پارامتر | نوع | الزامی؟ | توضیحات |
|---|:---:|:---:|---|
| `school_id` | عدد صحیح | اختیاری* | شناسه مدرسه جهت دریافت شناسنامه سلامت امنیت اختصاصی مستأجر |
| `region_id` | عدد صحیح | اختیاری* | شناسه منطقه برای دریافت تابلوی امنیت منطقه‌ای |

*\* ارسال حداقل یکی از دو پارامتر `school_id` یا `region_id` الزامی است.*

### کدهای وضعیت و پاسخ‌ها:
- `200 OK`: ارائه موفقیت‌آمیز وضعیت سلامت امنیت Zero Trust، موتور سیاست‌ها و محافظت زمان اجرا.
- `400 Bad Request`: در صورت عدم ارسال هر دو پارامتر.
- `401 Unauthorized`: در صورت عدم احراز هویت نشست کاربری.
- `403 Forbidden`: در صورت نقض تفکیک چندمستأجری یا نقش غیرمجاز (`ZERO_TRUST_TENANT_ISOLATION_VIOLATION` یا `ZERO_TRUST_ROLE_ACCESS_DENIED`).
