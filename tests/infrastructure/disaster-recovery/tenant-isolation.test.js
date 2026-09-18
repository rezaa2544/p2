/**
 * تست تفکیک چندمستأجری و سقط Fail-Closed در لایه DR (P1-SC-04)
 */
'use strict';

const assert = require('assert');
const {
  enforceDisasterRecoveryTenantIsolation,
  buildDisasterRecoveryHealthSnapshot
} = require('../../../server/infrastructure/disaster-recovery');

function runTenantIsolationTests() {
  console.log('▸ تست ۵: تفکیک چندمستأجری و سقط Fail-Closed در DR (tenant-isolation)');

  const managerSchoolA = { id: 10, role: 'manager', school_id: 101, region_id: 1 };
  const managerSchoolB = { id: 20, role: 'manager', school_id: 202, region_id: 1 };
  const student = { id: 30, role: 'student', school_id: 101, region_id: 1 };
  const parent = { id: 40, role: 'parent', school_id: 101, region_id: 1 };
  const teacher = { id: 50, role: 'teacher', school_id: 101, region_id: 1 };
  const superadmin = { id: 1, role: 'superadmin' };
  const eduOffice = { id: 2, role: 'edu_office', region_id: 1 };

  // ۱. مدیر مدرسه خود مجاز است
  assert.strictEqual(enforceDisasterRecoveryTenantIsolation(managerSchoolA, { school_id: 101 }), true);

  // ۲. مدیر مدرسه دیگر با خطای مشخص سقط می‌شود
  assert.throws(() => {
    enforceDisasterRecoveryTenantIsolation(managerSchoolA, { school_id: 202 });
  }, /DR_TENANT_ISOLATION_VIOLATION/);

  // ۳. نقش‌های غیرمجاز با خطای مشخص سقط می‌شوند
  assert.throws(() => {
    enforceDisasterRecoveryTenantIsolation(student, { school_id: 101 });
  }, /DR_ROLE_ACCESS_DENIED/);

  assert.throws(() => {
    enforceDisasterRecoveryTenantIsolation(parent, { school_id: 101 });
  }, /DR_ROLE_ACCESS_DENIED/);

  assert.throws(() => {
    enforceDisasterRecoveryTenantIsolation(teacher, { school_id: 101 });
  }, /DR_ROLE_ACCESS_DENIED/);

  // ۴. کاربر خالی یا نامعتبر سقط می‌شود
  assert.throws(() => {
    enforceDisasterRecoveryTenantIsolation(null, { school_id: 101 });
  }, /DR_TENANT_ISOLATION_VIOLATION/);

  // ۵. نقش‌های ستادی و سوپرادمین دسترسی دارند
  assert.strictEqual(enforceDisasterRecoveryTenantIsolation(superadmin, { school_id: 101 }), true);
  assert.strictEqual(enforceDisasterRecoveryTenantIsolation(eduOffice, { school_id: 101, region_id: 1 }), true);

  // ۶. ساخت اسنپ‌شات با مدیر مدرسه متناقض خطا می‌دهد
  assert.throws(() => {
    buildDisasterRecoveryHealthSnapshot({ schoolId: 202, user: managerSchoolA });
  }, /DR_TENANT_ISOLATION_VIOLATION/);

  console.log('  ✅ تفکیک چندمستأجری و کدهای خطای مصوب با موفقیت تایید شد');
}

if (require.main === module) {
  runTenantIsolationTests();
}

module.exports = { runTenantIsolationTests };
