/**
 * آزمون ۱۰: تفکیک چندمستأجری و سقط صریح نشت داده (Fail-Closed Tenant Isolation)
 */

'use strict';

const assert = require('assert');
const {
  enforcePolicySimulationAccessGuard,
  buildPolicySimulationSnapshot
} = require('../../../server/analytics/policy-simulation-engine');

function runTests() {
  console.log('▸ تست ۱۰: تفکیک چندمستأجری و سقط صریح Fail-Closed (tenant-isolation)');

  // ۱. مدیر مدرسه خودی
  const managerOwn = { id: 10, role: 'manager', school_id: 101 };
  assert.strictEqual(enforcePolicySimulationAccessGuard(managerOwn, { school_id: 101 }), true);

  // ۲. مدیر مدرسه برای مدرسه دیگر
  assert.throws(() => {
    enforcePolicySimulationAccessGuard(managerOwn, { school_id: 202 });
  }, /POLICY_SIMULATION_TENANT_ISOLATION_VIOLATION/, 'دسترسی مدیر به مدرسه دیگر باید مسدود شود');

  // ۳. کارشناس اداره منطقه خودی
  const districtOfficer = { id: 20, role: 'edu_office', region_id: 12 };
  assert.strictEqual(enforcePolicySimulationAccessGuard(districtOfficer, { region_id: 12 }), true);

  // ۴. کارشناس اداره برای منطقه دیگر
  assert.throws(() => {
    enforcePolicySimulationAccessGuard(districtOfficer, { region_id: 99 });
  }, /POLICY_SIMULATION_TENANT_ISOLATION_VIOLATION/, 'دسترسی کارشناس به منطقه دیگر باید مسدود شود');

  // ۵. نقش‌های غیرمجاز (دانش‌آموز، معلم، والد)
  const student = { id: 30, role: 'student', school_id: 101 };
  assert.throws(() => {
    enforcePolicySimulationAccessGuard(student, { school_id: 101 });
  }, /POLICY_SIMULATION_ROLE_ACCESS_DENIED/);

  const teacher = { id: 40, role: 'teacher', school_id: 101 };
  assert.throws(() => {
    enforcePolicySimulationAccessGuard(teacher, { school_id: 101 });
  }, /POLICY_SIMULATION_ROLE_ACCESS_DENIED/);

  // ۶. سوپرادمین
  const superadmin = { id: 1, role: 'superadmin' };
  assert.strictEqual(enforcePolicySimulationAccessGuard(superadmin, { school_id: 101 }), true);
  assert.strictEqual(enforcePolicySimulationAccessGuard(superadmin, { region_id: 99 }), true);

  // ۷. سقط صریح در متدهای اصلی در صورت عدم احراز دسترسی
  assert.throws(() => {
    buildPolicySimulationSnapshot({
      schoolId: 202,
      regionId: 1,
      options: { requester: managerOwn }
    });
  }, /POLICY_SIMULATION_TENANT_ISOLATION_VIOLATION/);

  console.log('  ✅ تفکیک چندمستأجری و سقط صریح نشت داده با موفقیت تأیید شد');
}

if (require.main === module) {
  runTests();
}

module.exports = { runTests };
