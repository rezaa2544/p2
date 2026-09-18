/**
 * تست تفکیک چندمستأجری و سقط Fail-Closed در استقرار پایلوت (P1-SC-05)
 */
'use strict';

const assert = require('assert');
const {
  enforcePilotTenantIsolation,
  buildPilotDeploymentHealthSnapshot
} = require('../../../server/deployment/pilot-traffic-management');

function runTenantIsolationTests() {
  console.log('▸ تست ۵: تفکیک چندمستأجری و سقط Fail-Closed در پایلوت (tenant-isolation)');

  const managerSchoolA = { id: 10, role: 'manager', school_id: 101, region_id: 1 };
  const managerSchoolB = { id: 20, role: 'manager', school_id: 202, region_id: 1 };
  const student = { id: 30, role: 'student', school_id: 101, region_id: 1 };
  const parent = { id: 40, role: 'parent', school_id: 101, region_id: 1 };
  const teacher = { id: 50, role: 'teacher', school_id: 101, region_id: 1 };
  const superadmin = { id: 1, role: 'superadmin' };
  const eduOffice = { id: 2, role: 'edu_office', region_id: 1 };

  // ۱. مدیر مدرسه خود مجاز است
  assert.strictEqual(enforcePilotTenantIsolation(managerSchoolA, { school_id: 101 }), true);

  // ۲. مدیر مدرسه دیگر با خطای مشخص سقط می‌شود
  assert.throws(() => {
    enforcePilotTenantIsolation(managerSchoolA, { school_id: 202 });
  }, /PILOT_TENANT_ISOLATION_VIOLATION/);

  // ۳. نقش‌های غیرمجاز با خطای مشخص سقط می‌شوند
  assert.throws(() => {
    enforcePilotTenantIsolation(student, { school_id: 101 });
  }, /PILOT_ROLE_ACCESS_DENIED/);

  assert.throws(() => {
    enforcePilotTenantIsolation(parent, { school_id: 101 });
  }, /PILOT_ROLE_ACCESS_DENIED/);

  assert.throws(() => {
    enforcePilotTenantIsolation(teacher, { school_id: 101 });
  }, /PILOT_ROLE_ACCESS_DENIED/);

  // ۴. کاربر خالی یا نامعتبر سقط می‌شود
  assert.throws(() => {
    enforcePilotTenantIsolation(null, { school_id: 101 });
  }, /PILOT_TENANT_ISOLATION_VIOLATION/);

  // ۵. نقش‌های ستادی و سوپرادمین دسترسی دارند
  assert.strictEqual(enforcePilotTenantIsolation(superadmin, { school_id: 101 }), true);
  assert.strictEqual(enforcePilotTenantIsolation(eduOffice, { school_id: 101, region_id: 1 }), true);

  // ۶. ساخت اسنپ‌شات با مدیر مدرسه متناقض خطا می‌دهد
  assert.throws(() => {
    buildPilotDeploymentHealthSnapshot({ schoolId: 202, user: managerSchoolA });
  }, /PILOT_TENANT_ISOLATION_VIOLATION/);

  console.log('  ✅ تفکیک چندمستأجری و کدهای خطای مصوب با موفقیت تایید شد');
}

if (require.main === module) {
  runTenantIsolationTests();
}

module.exports = { runTenantIsolationTests };
