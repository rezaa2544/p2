/**
 * آزمون ۱۲: تفکیک چندمستأجری و سقط صریح Fail-Closed (tenant-isolation)
 */

'use strict';

const assert = require('assert');
const {
  enforceExecutionAccessGuard,
  createExecutionWorkflow,
  buildExecutionDashboard
} = require('../../../server/analytics/operational-intelligence-execution');

function runTests() {
  console.log('▸ تست ۱۲: تفکیک چندمستأجری و سقط صریح Fail-Closed (tenant-isolation)');

  // ۱. مدیر مدرسه خودی
  const managerOwn = { id: 10, role: 'manager', school_id: 101 };
  assert.strictEqual(enforceExecutionAccessGuard(managerOwn, { school_id: 101 }), true);

  // ۲. مدیر مدرسه برای مدرسه دیگر
  assert.throws(() => {
    enforceExecutionAccessGuard(managerOwn, { school_id: 202 });
  }, /OPERATIONAL_EXECUTION_TENANT_ISOLATION_VIOLATION/, 'دسترسی مدیر به مدرسه دیگر باید مسدود شود');

  // ۳. کارشناس اداره منطقه خودی
  const districtOfficer = { id: 20, role: 'edu_office', region_id: 12 };
  assert.strictEqual(enforceExecutionAccessGuard(districtOfficer, { region_id: 12 }), true);

  // ۴. کارشناس اداره برای منطقه دیگر
  assert.throws(() => {
    enforceExecutionAccessGuard(districtOfficer, { region_id: 99 });
  }, /OPERATIONAL_EXECUTION_TENANT_ISOLATION_VIOLATION/, 'دسترسی کارشناس به منطقه دیگر باید مسدود شود');

  // ۵. نقش‌های غیرمجاز (دانش‌آموز، والد)
  const student = { id: 30, role: 'student', school_id: 101 };
  assert.throws(() => {
    enforceExecutionAccessGuard(student, { school_id: 101 });
  }, /OPERATIONAL_EXECUTION_ROLE_ACCESS_DENIED/);

  const parent = { id: 35, role: 'parent', school_id: 101 };
  assert.throws(() => {
    enforceExecutionAccessGuard(parent, { school_id: 101 });
  }, /OPERATIONAL_EXECUTION_ROLE_ACCESS_DENIED/);

  // ۶. سوپرادمین
  const superadmin = { id: 1, role: 'superadmin' };
  assert.strictEqual(enforceExecutionAccessGuard(superadmin, { school_id: 101 }), true);
  assert.strictEqual(enforceExecutionAccessGuard(superadmin, { region_id: 99 }), true);

  // ۷. سقط صریح در متدهای اصلی در صورت عدم احراز دسترسی
  assert.throws(() => {
    createExecutionWorkflow({
      schoolId: 202,
      regionId: 1,
      options: { requester: managerOwn }
    });
  }, /OPERATIONAL_EXECUTION_TENANT_ISOLATION_VIOLATION/);

  assert.throws(() => {
    buildExecutionDashboard({
      schoolId: 202,
      regionId: 1,
      options: { requester: managerOwn }
    });
  }, /OPERATIONAL_EXECUTION_TENANT_ISOLATION_VIOLATION/);

  console.log('  ✅ تفکیک چندمستأجری و سقط صریح نشت داده با موفقیت تأیید شد');
}

if (require.main === module) {
  runTests();
}

module.exports = { runTests };
