/**
 * آزمون ۱۰: تفکیک چندمستأجری و سقط صریح نشت داده (Fail-Closed Tenant Isolation)
 */

'use strict';

const assert = require('assert');
const {
  enforceGovernanceDashboardAccessGuard,
  buildGovernanceSnapshot,
  buildDistrictGovernanceOverview
} = require('../../../server/analytics/intelligence-governance-dashboard');

function runTests() {
  console.log('▸ تست ۱۰: تفکیک چندمستأجری و سقط صریح Fail-Closed (enforceGovernanceDashboardAccessGuard)');

  // ۱. مدیر مدرسه خودی
  const managerOwn = { id: 10, role: 'manager', school_id: 101 };
  assert.strictEqual(enforceGovernanceDashboardAccessGuard(managerOwn, { school_id: 101 }), true);

  // ۲. مدیر مدرسه برای مدرسه دیگر
  assert.throws(() => {
    enforceGovernanceDashboardAccessGuard(managerOwn, { school_id: 202 });
  }, /GOVERNANCE_TENANT_ISOLATION_VIOLATION/, 'دسترسی مدیر به مدرسه دیگر باید مسدود شود');

  // ۳. کارشناس اداره منطقه خودی
  const districtOfficer = { id: 20, role: 'edu_office', region_id: 12 };
  assert.strictEqual(enforceGovernanceDashboardAccessGuard(districtOfficer, { region_id: 12 }), true);

  // ۴. کارشناس اداره برای منطقه دیگر
  assert.throws(() => {
    enforceGovernanceDashboardAccessGuard(districtOfficer, { region_id: 99 });
  }, /GOVERNANCE_TENANT_ISOLATION_VIOLATION/, 'دسترسی کارشناس به منطقه دیگر باید مسدود شود');

  // ۵. نقش‌های غیرمجاز (دانش‌آموز، معلم، والد)
  const student = { id: 30, role: 'student', school_id: 101 };
  assert.throws(() => {
    enforceGovernanceDashboardAccessGuard(student, { school_id: 101 });
  }, /GOVERNANCE_ROLE_ACCESS_DENIED/);

  const teacher = { id: 40, role: 'teacher', school_id: 101 };
  assert.throws(() => {
    enforceGovernanceDashboardAccessGuard(teacher, { school_id: 101 });
  }, /GOVERNANCE_ROLE_ACCESS_DENIED/);

  // ۶. سوپرادمین
  const superadmin = { id: 1, role: 'superadmin' };
  assert.strictEqual(enforceGovernanceDashboardAccessGuard(superadmin, { school_id: 101 }), true);
  assert.strictEqual(enforceGovernanceDashboardAccessGuard(superadmin, { region_id: 99 }), true);

  // ۷. سقط صریح در متدهای اصلی در صورت عدم احراز دسترسی
  assert.throws(() => {
    buildGovernanceSnapshot({
      schoolId: 202,
      regionId: 1,
      options: { requester: managerOwn }
    });
  }, /GOVERNANCE_TENANT_ISOLATION_VIOLATION/);

  assert.throws(() => {
    buildDistrictGovernanceOverview({
      regionId: 99,
      options: { requester: districtOfficer }
    });
  }, /GOVERNANCE_TENANT_ISOLATION_VIOLATION/);

  console.log('  ✅ تفکیک چندمستأجری و سقط صریح نشت داده با موفقیت تأیید شد');
}

if (require.main === module) {
  runTests();
}

module.exports = { runTests };
