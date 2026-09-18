/**
 * آزمون ۴: تفکیک چندمستأجری و سقط صریح Fail-Closed (tenant-isolation)
 */

'use strict';

const assert = require('assert');
const {
  enforcePlatformAccessGuard,
  buildUnifiedIntelligenceSnapshot
} = require('../../../server/analytics/intelligence-platform-integration');

function runTests() {
  console.log('▸ تست ۴: تفکیک چندمستأجری و سقط صریح Fail-Closed (tenant-isolation)');

  // ۱. مدیر مدرسه خودی
  const managerOwn = { id: 10, role: 'manager', school_id: 101 };
  assert.strictEqual(enforcePlatformAccessGuard(managerOwn, { school_id: 101 }), true);

  // ۲. مدیر مدرسه برای مدرسه دیگر
  assert.throws(() => {
    enforcePlatformAccessGuard(managerOwn, { school_id: 202 });
  }, /INTELLIGENCE_PLATFORM_TENANT_ISOLATION_VIOLATION/, 'دسترسی مدیر به مدرسه دیگر باید مسدود شود');

  // ۳. کارشناس اداره منطقه خودی
  const districtOfficer = { id: 20, role: 'edu_office', region_id: 12 };
  assert.strictEqual(enforcePlatformAccessGuard(districtOfficer, { region_id: 12 }), true);

  // ۴. کارشناس اداره برای منطقه دیگر
  assert.throws(() => {
    enforcePlatformAccessGuard(districtOfficer, { region_id: 99 });
  }, /INTELLIGENCE_PLATFORM_TENANT_ISOLATION_VIOLATION/, 'دسترسی کارشناس به منطقه دیگر باید مسدود شود');

  // ۵. نقش‌های غیرمجاز (دانش‌آموز، والد، معلم عمومی)
  const student = { id: 30, role: 'student', school_id: 101 };
  assert.throws(() => {
    enforcePlatformAccessGuard(student, { school_id: 101 });
  }, /INTELLIGENCE_PLATFORM_ROLE_ACCESS_DENIED/);

  const teacher = { id: 35, role: 'teacher', school_id: 101 };
  assert.throws(() => {
    enforcePlatformAccessGuard(teacher, { school_id: 101 });
  }, /INTELLIGENCE_PLATFORM_ROLE_ACCESS_DENIED/);

  // ۶. سوپرادمین
  const superadmin = { id: 1, role: 'superadmin' };
  assert.strictEqual(enforcePlatformAccessGuard(superadmin, { school_id: 101 }), true);
  assert.strictEqual(enforcePlatformAccessGuard(superadmin, { region_id: 99 }), true);

  // ۷. سقط صریح در ساخت شناسنامه یکپارچه در صورت نقض
  assert.throws(() => {
    buildUnifiedIntelligenceSnapshot({
      schoolId: 202,
      regionId: 1,
      options: { requester: managerOwn }
    });
  }, /INTELLIGENCE_PLATFORM_TENANT_ISOLATION_VIOLATION/);

  console.log('  ✅ تفکیک چندمستأجری و سقط صریح نشت داده با خطاهای رسمی مصوب تأیید شد');
}

if (require.main === module) {
  runTests();
}

module.exports = { runTests };
