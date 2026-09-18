/**
 * آزمون ۱۱: تفکیک چندمستأجری و گارد ضد نفوذ (enforceFeedbackMemoryAccessGuard)
 */

'use strict';

const assert = require('assert');
const {
  enforceFeedbackMemoryAccessGuard,
  buildOrganizationalLearningProfile
} = require('../../../server/analytics/intelligence-feedback-memory');

function runTests() {
  console.log('▸ تست ۱۱: تفکیک چندمستأجری و گارد ضد نفوذ (Fail-Closed Tenant Isolation)');

  // ۱. مدیر مدرسه خودی
  const managerUser = { id: 10, role: 'manager', school_id: 101 };
  assert.strictEqual(enforceFeedbackMemoryAccessGuard(managerUser, { school_id: 101 }), true);

  // ۲. تلاش مدیر برای دسترسی به مدرسه دیگر (Cross-school IDOR)
  assert.throws(() => {
    enforceFeedbackMemoryAccessGuard(managerUser, { school_id: 202 });
  }, /FEEDBACK_TENANT_ISOLATION_VIOLATION/, 'دسترسی مدیر به مدرسه دیگر باید مسدود شود');

  // ۳. کارشناس اداره منطقه خودی
  const districtOfficer = { id: 20, role: 'edu_office', region_id: 12 };
  assert.strictEqual(enforceFeedbackMemoryAccessGuard(districtOfficer, { region_id: 12 }), true);

  // ۴. کارشناس اداره منطقه برای منطقه دیگر (Cross-region)
  assert.throws(() => {
    enforceFeedbackMemoryAccessGuard(districtOfficer, { region_id: 99 });
  }, /FEEDBACK_TENANT_ISOLATION_VIOLATION/, 'دسترسی کارشناس به منطقه دیگر باید مسدود شود');

  // ۵. دسترسی غیرمجاز نقش‌های دیگر (دانش‌آموز، والد، معلم)
  const studentUser = { id: 30, role: 'student', school_id: 101 };
  assert.throws(() => {
    enforceFeedbackMemoryAccessGuard(studentUser, { school_id: 101 });
  }, /FEEDBACK_ROLE_ACCESS_DENIED/, 'نقش دانش‌آموز نباید دسترسی داشته باشد');

  const teacherUser = { id: 40, role: 'teacher', school_id: 101 };
  assert.throws(() => {
    enforceFeedbackMemoryAccessGuard(teacherUser, { school_id: 101 });
  }, /FEEDBACK_ROLE_ACCESS_DENIED/, 'نقش معلم نباید به حافظه سازمانی دسترسی مستقیم داشته باشد');

  // ۶. سوپرادمین
  const superAdmin = { id: 1, role: 'superadmin' };
  assert.strictEqual(enforceFeedbackMemoryAccessGuard(superAdmin, { school_id: 101 }), true);
  assert.strictEqual(enforceFeedbackMemoryAccessGuard(superAdmin, { region_id: 99 }), true);

  // ۷. سقط قاطع در تولید پروفایل سازمانی برای کاربر فاقد دسترسی
  assert.throws(() => {
    buildOrganizationalLearningProfile({
      schoolId: 202,
      regionId: 1,
      history: [],
      options: { requester: managerUser }
    });
  }, /FEEDBACK_TENANT_ISOLATION_VIOLATION/);

  console.log('  ✅ تفکیک کامل چندمستأجری و سقط صریح Fail-Closed با موفقیت تأیید شد');
}

if (require.main === module) {
  runTests();
}

module.exports = { runTests };
