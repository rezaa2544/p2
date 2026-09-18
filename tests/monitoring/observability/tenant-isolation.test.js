/**
 * تست تفکیک چندمستأجری و کنترل نقش‌ها در لایه رصدپذیری (P1-SC-03)
 */
'use strict';

const assert = require('assert');
const {
  enforceObservabilityTenantIsolation,
  buildObservabilityHealthSnapshot
} = require('../../../server/monitoring/production-observability');

function runTenantIsolationTests() {
  console.log('▸ تست ۱: تفکیک چندمستأجری و سقط Fail-Closed در رصدپذیری (tenant-isolation)');

  const managerSchoolA = { id: 10, role: 'manager', school_id: 101, region_id: 1 };
  const managerSchoolB = { id: 20, role: 'manager', school_id: 202, region_id: 1 };
  const student = { id: 30, role: 'student', school_id: 101, region_id: 1 };
  const parent = { id: 40, role: 'parent', school_id: 101, region_id: 1 };
  const teacher = { id: 50, role: 'teacher', school_id: 101, region_id: 1 };
  const superadmin = { id: 1, role: 'superadmin' };
  const eduOffice = { id: 2, role: 'edu_office', region_id: 1 };

  // ۱. مدیر مدرسه خود مجاز است
  assert.strictEqual(enforceObservabilityTenantIsolation(managerSchoolA, { school_id: 101 }), true);

  // ۲. مدیر مدرسه دیگر با خطای مشخص سقط می‌شود
  assert.throws(() => {
    enforceObservabilityTenantIsolation(managerSchoolA, { school_id: 202 });
  }, /OBSERVABILITY_TENANT_ISOLATION_VIOLATION/);

  // ۳. نقش‌های غیرمجاز با خطای مشخص سقط می‌شوند
  assert.throws(() => {
    enforceObservabilityTenantIsolation(student, { school_id: 101 });
  }, /OBSERVABILITY_ROLE_ACCESS_DENIED/);

  assert.throws(() => {
    enforceObservabilityTenantIsolation(parent, { school_id: 101 });
  }, /OBSERVABILITY_ROLE_ACCESS_DENIED/);

  assert.throws(() => {
    enforceObservabilityTenantIsolation(teacher, { school_id: 101 });
  }, /OBSERVABILITY_ROLE_ACCESS_DENIED/);

  // ۴. کاربر خالی یا نامعتبر سقط می‌شود
  assert.throws(() => {
    enforceObservabilityTenantIsolation(null, { school_id: 101 });
  }, /OBSERVABILITY_TENANT_ISOLATION_VIOLATION/);

  // ۵. نقش‌های ستادی و سوپرادمین دسترسی دارند
  assert.strictEqual(enforceObservabilityTenantIsolation(superadmin, { school_id: 101 }), true);
  assert.strictEqual(enforceObservabilityTenantIsolation(eduOffice, { school_id: 101, region_id: 1 }), true);

  // ۶. ساخت اسنپ‌شات با مدیر مدرسه متناقض خطا می‌دهد
  assert.throws(() => {
    buildObservabilityHealthSnapshot({ schoolId: 202, user: managerSchoolA });
  }, /OBSERVABILITY_TENANT_ISOLATION_VIOLATION/);

  console.log('  ✅ تفکیک چندمستأجری و کدهای خطای مصوب با موفقیت تایید شد');
}

if (require.main === module) {
  runTenantIsolationTests();
}

module.exports = { runTenantIsolationTests };
