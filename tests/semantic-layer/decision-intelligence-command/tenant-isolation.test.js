/**
 * آزمون ۱۰: تفکیک چندمستأجری و سقط صریح نشت داده (Fail-Closed Tenant Isolation)
 */

'use strict';

const assert = require('assert');
const {
  enforceDecisionCommandAccessGuard,
  buildDecisionCommandSnapshot
} = require('../../../server/analytics/decision-intelligence-command');

function runTests() {
  console.log('▸ تست ۱۰: تفکیک چندمستأجری و سقط صریح Fail-Closed (tenant-isolation)');

  // ۱. مدیر مدرسه خودی
  const managerOwn = { id: 10, role: 'manager', school_id: 101 };
  assert.strictEqual(enforceDecisionCommandAccessGuard(managerOwn, { school_id: 101 }), true);

  // ۲. مدیر مدرسه برای مدرسه دیگر
  assert.throws(() => {
    enforceDecisionCommandAccessGuard(managerOwn, { school_id: 202 });
  }, /DECISION_COMMAND_TENANT_ISOLATION_VIOLATION/, 'دسترسی مدیر به مدرسه دیگر باید مسدود شود');

  // ۳. کارشناس اداره منطقه خودی
  const districtOfficer = { id: 20, role: 'edu_office', region_id: 12 };
  assert.strictEqual(enforceDecisionCommandAccessGuard(districtOfficer, { region_id: 12 }), true);

  // ۴. کارشناس اداره برای منطقه دیگر
  assert.throws(() => {
    enforceDecisionCommandAccessGuard(districtOfficer, { region_id: 99 });
  }, /DECISION_COMMAND_TENANT_ISOLATION_VIOLATION/, 'دسترسی کارشناس به منطقه دیگر باید مسدود شود');

  // ۵. نقش‌های غیرمجاز (دانش‌آموز، معلم، والد)
  const student = { id: 30, role: 'student', school_id: 101 };
  assert.throws(() => {
    enforceDecisionCommandAccessGuard(student, { school_id: 101 });
  }, /DECISION_COMMAND_ROLE_ACCESS_DENIED/);

  const teacher = { id: 40, role: 'teacher', school_id: 101 };
  assert.throws(() => {
    enforceDecisionCommandAccessGuard(teacher, { school_id: 101 });
  }, /DECISION_COMMAND_ROLE_ACCESS_DENIED/);

  // ۶. سوپرادمین
  const superadmin = { id: 1, role: 'superadmin' };
  assert.strictEqual(enforceDecisionCommandAccessGuard(superadmin, { school_id: 101 }), true);
  assert.strictEqual(enforceDecisionCommandAccessGuard(superadmin, { region_id: 99 }), true);

  // ۷. سقط صریح در متدهای اصلی در صورت عدم احراز دسترسی
  assert.throws(() => {
    buildDecisionCommandSnapshot({
      schoolId: 202,
      regionId: 1,
      options: { requester: managerOwn }
    });
  }, /DECISION_COMMAND_TENANT_ISOLATION_VIOLATION/);

  console.log('  ✅ تفکیک چندمستأجری و سقط صریح نشت داده با موفقیت تأیید شد');
}

if (require.main === module) {
  runTests();
}

module.exports = { runTests };
