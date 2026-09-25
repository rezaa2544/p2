/**
 * آزمون گارد کنترل دسترسی مرکز هوشمندی مدرسه (Anti-IDOR Access Guard)
 */

'use strict';

const assert = require('assert');
const { enforceSchoolIntelligenceAccessGuard } = require('../../../server/analytics/school-intelligence-center');

function runTest() {
  console.log('▸ تست ۶: گارد کنترل دسترسی و ضد نفوذ مرکز هوشمندی (enforceSchoolIntelligenceAccessGuard)');

  const targetSchoolId = 25;

  // ۱. مدیر مدرسه خودی: مجاز
  const validManager = { id: 101, role: 'manager', school_id: 25 };
  assert.strictEqual(
    enforceSchoolIntelligenceAccessGuard(validManager, targetSchoolId),
    true,
    'Manager of target school should be allowed'
  );

  // ۲. مدیر مدرسه دیگر: سقط با خطای TENANT_ISOLATION_VIOLATION
  const foreignManager = { id: 102, role: 'manager', school_id: 99 };
  assert.throws(
    () => enforceSchoolIntelligenceAccessGuard(foreignManager, targetSchoolId),
    /TENANT_ISOLATION_VIOLATION/,
    'Manager of another school must be rejected'
  );

  // ۳. ناظر اداره آموزش و پرورش: فقط مدارسِ داخلِ محدودهٔ جغرافیاییِ دفترش
  // (اصلاحِ Phase B: پیش از این edu_office بدونِ هیچ مهاری مجاز شمرده می‌شد).
  const officeStore = {
    offices: [{ id: 7, province_id: 1 }],
    schools: [{ id: 25, province_id: 1 }, { id: 30, province_id: 2 }]
  };
  const eduOffice = { id: 201, role: 'edu_office', office_id: 7 };
  const eduOfficeForeign = { id: 202, role: 'edu_office', office_id: 8 };
  const eduOfficeNoOffice = { id: 203, role: 'edu_office' };
  const superadmin = { id: 1, role: 'superadmin' };
  assert.strictEqual(enforceSchoolIntelligenceAccessGuard(eduOffice, targetSchoolId, { store: officeStore }), true);
  assert.strictEqual(enforceSchoolIntelligenceAccessGuard(superadmin, targetSchoolId), true);
  assert.throws(
    () => enforceSchoolIntelligenceAccessGuard(eduOffice, 30, { store: officeStore }),
    /TENANT_ISOLATION_VIOLATION/,
    'edu_office must not access a school outside its office scope'
  );
  assert.throws(
    () => enforceSchoolIntelligenceAccessGuard(eduOfficeForeign, targetSchoolId, { store: officeStore }),
    /TENANT_ISOLATION_VIOLATION/,
    'edu_office with an unknown office must fail closed'
  );
  assert.throws(
    () => enforceSchoolIntelligenceAccessGuard(eduOfficeNoOffice, targetSchoolId, { store: officeStore }),
    /TENANT_ISOLATION_VIOLATION/,
    'edu_office without an office must fail closed, not pass open'
  );

  // ۴. نقش‌های غیرمجاز: معلم، دانش‌آموز، والد، راننده
  const teacher = { id: 301, role: 'teacher', school_id: 25 };
  const student = { id: 401, role: 'student', school_id: 25 };
  const parent = { id: 501, role: 'parent', school_id: 25 };
  const driver = { id: 601, role: 'driver', school_id: 25 };

  assert.throws(() => enforceSchoolIntelligenceAccessGuard(teacher, targetSchoolId), /SCHOOL_INTELLIGENCE_ACCESS_FORBIDDEN/);
  assert.throws(() => enforceSchoolIntelligenceAccessGuard(student, targetSchoolId), /SCHOOL_INTELLIGENCE_ACCESS_FORBIDDEN/);
  assert.throws(() => enforceSchoolIntelligenceAccessGuard(parent, targetSchoolId), /SCHOOL_INTELLIGENCE_ACCESS_FORBIDDEN/);
  assert.throws(() => enforceSchoolIntelligenceAccessGuard(driver, targetSchoolId), /SCHOOL_INTELLIGENCE_ACCESS_FORBIDDEN/);

  console.log('  ✅ اعتبارسنجی قاطع ضد نفوذ (Anti-IDOR) و مسدودسازی دسترسی غیرمجاز');
}

module.exports = { runTest };
if (require.main === module) runTest();
