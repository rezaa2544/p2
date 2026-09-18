/**
 * آزمون گارد امنیتی و کنترل دسترسی راهبری کیفیت (enforceQualityGovernanceAccessGuard)
 */

'use strict';

const assert = require('assert');
const { enforceQualityGovernanceAccessGuard } = require('../../../server/analytics/quality-governance');

function runTest() {
  console.log('▸ تست ۱: گارد امنیتی و کنترل دسترسی راهبری کیفیت (enforceQualityGovernanceAccessGuard)');

  const schoolId = 15;
  const regionId = 2;

  // ۱. مدیر مدرسه خودی: مجاز
  const validManager = { id: 101, role: 'manager', school_id: 15 };
  assert.strictEqual(enforceQualityGovernanceAccessGuard(validManager, { school_id: schoolId }), true);

  // ۲. مدیر مدرسه دیگر: سقط با TENANT_ISOLATION_VIOLATION
  const foreignManager = { id: 102, role: 'manager', school_id: 99 };
  assert.throws(
    () => enforceQualityGovernanceAccessGuard(foreignManager, { school_id: schoolId }),
    /TENANT_ISOLATION_VIOLATION/,
    'Manager must not access quality governance of another school'
  );

  // ۳. کارشناس اداره منطقه خودی: مجاز
  const validEduOffice = { id: 201, role: 'edu_office', region_id: 2 };
  assert.strictEqual(enforceQualityGovernanceAccessGuard(validEduOffice, { region_id: regionId }), true);

  // ۴. کارشناس اداره منطقه دیگر: سقط با TENANT_ISOLATION_VIOLATION
  const foreignEduOffice = { id: 202, role: 'edu_office', region_id: 5 };
  assert.throws(
    () => enforceQualityGovernanceAccessGuard(foreignEduOffice, { region_id: regionId }),
    /TENANT_ISOLATION_VIOLATION/,
    'Edu office must not access governance of another region'
  );

  // ۵. مدیر ارشد: مجاز
  const superadmin = { id: 1, role: 'superadmin' };
  assert.strictEqual(enforceQualityGovernanceAccessGuard(superadmin, { school_id: schoolId }), true);

  // ۶. نقش‌های غیرمجاز: معلم، دانش‌آموز، والد، راننده
  const teacher = { id: 301, role: 'teacher', school_id: 15 };
  const student = { id: 401, role: 'student', school_id: 15 };
  const parent = { id: 501, role: 'parent', school_id: 15 };

  assert.throws(() => enforceQualityGovernanceAccessGuard(teacher, { school_id: schoolId }), /QUALITY_GOVERNANCE_ACCESS_FORBIDDEN/);
  assert.throws(() => enforceQualityGovernanceAccessGuard(student, { school_id: schoolId }), /QUALITY_GOVERNANCE_ACCESS_FORBIDDEN/);
  assert.throws(() => enforceQualityGovernanceAccessGuard(parent, { school_id: schoolId }), /QUALITY_GOVERNANCE_ACCESS_FORBIDDEN/);

  console.log('  ✅ اعتبارسنجی قاطع ضد نفوذ (Anti-IDOR) و مهار دسترسی غیرمجاز به راهبری کیفیت');
}

module.exports = { runTest };
if (require.main === module) runTest();
