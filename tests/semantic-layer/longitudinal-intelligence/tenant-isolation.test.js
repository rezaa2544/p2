/**
 * آزمون گارد امنیتی و تفکیک چندمستأجری در پایش طولی (enforceLongitudinalAccessGuard)
 */

'use strict';

const assert = require('assert');
const {
  enforceLongitudinalAccessGuard
} = require('../../../server/analytics/longitudinal-intelligence-monitoring');

function runTest() {
  console.log('▸ تست ۹: تفکیک چندمستأجری و گارد ضد نفوذ (enforceLongitudinalAccessGuard)');

  // ۱. مدیر مدرسه خودی: مجاز
  const validManager = { id: 10, role: 'manager', school_id: 5 };
  assert.strictEqual(enforceLongitudinalAccessGuard(validManager, { school_id: 5 }), true);

  // ۲. مدیر مدرسه دیگر: سقط با LONGITUDINAL_TENANT_ISOLATION_VIOLATION
  const foreignManager = { id: 11, role: 'manager', school_id: 8 };
  assert.throws(
    () => enforceLongitudinalAccessGuard(foreignManager, { school_id: 5 }),
    /LONGITUDINAL_TENANT_ISOLATION_VIOLATION/,
    'Manager must not access longitudinal data of another school'
  );

  // ۳. کارشناس اداره منطقه خودی: مجاز
  const validOfficer = { id: 20, role: 'edu_office', region_id: 3 };
  assert.strictEqual(enforceLongitudinalAccessGuard(validOfficer, { region_id: 3 }), true);

  // ۴. کارشناس اداره منطقه دیگر: سقط با خطای تفکیک مستأجر
  const foreignOfficer = { id: 21, role: 'edu_office', region_id: 7 };
  assert.throws(
    () => enforceLongitudinalAccessGuard(foreignOfficer, { region_id: 3 }),
    /LONGITUDINAL_TENANT_ISOLATION_VIOLATION/,
    'Officer must not access longitudinal data of another region'
  );

  // ۵. سوپرادمین: مجاز در همه موارد
  const superadmin = { id: 1, role: 'superadmin' };
  assert.strictEqual(enforceLongitudinalAccessGuard(superadmin, { school_id: 5 }), true);
  assert.strictEqual(enforceLongitudinalAccessGuard(superadmin, { region_id: 3 }), true);

  // ۶. نقش‌های غیرمجاز: معلم، دانش‌آموز، والد
  const teacher = { id: 30, role: 'teacher', school_id: 5 };
  const student = { id: 40, role: 'student', school_id: 5 };
  const parent = { id: 50, role: 'parent', school_id: 5 };

  assert.throws(() => enforceLongitudinalAccessGuard(teacher, { school_id: 5 }), /LONGITUDINAL_ACCESS_FORBIDDEN/);
  assert.throws(() => enforceLongitudinalAccessGuard(student, { school_id: 5 }), /LONGITUDINAL_ACCESS_FORBIDDEN/);
  assert.throws(() => enforceLongitudinalAccessGuard(parent, { school_id: 5 }), /LONGITUDINAL_ACCESS_FORBIDDEN/);

  console.log('  ✅ اعتبارسنجی قاطع ضد نفوذ (Anti-IDOR) و مهار دسترسی غیرمجاز با سقط صریح Fail-Closed');
}

module.exports = { runTest };
if (require.main === module) runTest();
