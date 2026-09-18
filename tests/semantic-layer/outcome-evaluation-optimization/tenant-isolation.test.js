/**
 * آزمون ۱۰: تفکیک چندمستأجری و سقط صریح Fail-Closed (tenant-isolation)
 */

'use strict';

const assert = require('assert');
const {
  enforceOutcomeEvaluationAccessGuard,
  buildOutcomeEvaluationSnapshot
} = require('../../../server/analytics/outcome-evaluation-optimization');

function runTests() {
  console.log('▸ تست ۱۰: تفکیک چندمستأجری و سقط صریح Fail-Closed (tenant-isolation)');

  // ۱. مدیر مدرسه خودی
  const managerOwn = { id: 10, role: 'manager', school_id: 101 };
  assert.strictEqual(enforceOutcomeEvaluationAccessGuard(managerOwn, { school_id: 101 }), true);

  // ۲. مدیر مدرسه برای مدرسه دیگر
  assert.throws(() => {
    enforceOutcomeEvaluationAccessGuard(managerOwn, { school_id: 202 });
  }, /OUTCOME_EVALUATION_TENANT_ISOLATION_VIOLATION/, 'دسترسی مدیر به مدرسه دیگر باید مسدود شود');

  // ۳. کارشناس اداره منطقه خودی
  const districtOfficer = { id: 20, role: 'edu_office', region_id: 12 };
  assert.strictEqual(enforceOutcomeEvaluationAccessGuard(districtOfficer, { region_id: 12 }), true);

  // ۴. کارشناس اداره برای منطقه دیگر
  assert.throws(() => {
    enforceOutcomeEvaluationAccessGuard(districtOfficer, { region_id: 99 });
  }, /OUTCOME_EVALUATION_TENANT_ISOLATION_VIOLATION/, 'دسترسی کارشناس به منطقه دیگر باید مسدود شود');

  // ۵. نقش‌های غیرمجاز (دانش‌آموز، والد، معلم عمومی)
  const student = { id: 30, role: 'student', school_id: 101 };
  assert.throws(() => {
    enforceOutcomeEvaluationAccessGuard(student, { school_id: 101 });
  }, /OUTCOME_EVALUATION_ROLE_ACCESS_DENIED/);

  const teacher = { id: 35, role: 'teacher', school_id: 101 };
  assert.throws(() => {
    enforceOutcomeEvaluationAccessGuard(teacher, { school_id: 101 });
  }, /OUTCOME_EVALUATION_ROLE_ACCESS_DENIED/);

  // ۶. سوپرادمین
  const superadmin = { id: 1, role: 'superadmin' };
  assert.strictEqual(enforceOutcomeEvaluationAccessGuard(superadmin, { school_id: 101 }), true);
  assert.strictEqual(enforceOutcomeEvaluationAccessGuard(superadmin, { region_id: 99 }), true);

  // ۷. سقط صریح در ساخت شناسنامه در صورت نقض دسترسی
  assert.throws(() => {
    buildOutcomeEvaluationSnapshot({
      schoolId: 202,
      regionId: 1,
      options: { requester: managerOwn }
    });
  }, /OUTCOME_EVALUATION_TENANT_ISOLATION_VIOLATION/);

  console.log('  ✅ تفکیک چندمستأجری و سقط صریح نشت داده با موفقیت تأیید شد');
}

if (require.main === module) {
  runTests();
}

module.exports = { runTests };
