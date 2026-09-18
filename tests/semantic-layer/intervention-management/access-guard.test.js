/**
 * آزمون گارد کنترل دسترسی و محرمانگی پرونده مداخله (Anti-IDOR & Privacy Guard)
 */

'use strict';

const assert = require('assert');
const { enforceInterventionAccessGuard } = require('../../../server/analytics/intervention-case-management');

function runTest() {
  console.log('▸ تست ۱: گارد محرمانگی و ضد نفوذ پرونده‌های مشاوره‌ای (Anti-IDOR Access Guard)');

  const caseRecord = {
    case_id: 'CASE-10-101',
    student_id: 101,
    school_id: 10,
    assigned_to_id: 301
  };

  // ۱. مشاور مدرسه خودی: مجاز
  const counselor = { id: 301, role: 'counselor', school_id: 10 };
  assert.strictEqual(enforceInterventionAccessGuard(counselor, caseRecord), true);

  // ۲. مدیر مدرسه خودی: مجاز
  const manager = { id: 401, role: 'manager', school_id: 10 };
  assert.strictEqual(enforceInterventionAccessGuard(manager, caseRecord), true);

  // ۳. مشاور یا مدیر مدرسه دیگر: سقط با TENANT_ISOLATION_VIOLATION
  const foreignCounselor = { id: 302, role: 'counselor', school_id: 99 };
  assert.throws(
    () => enforceInterventionAccessGuard(foreignCounselor, caseRecord),
    /TENANT_ISOLATION_VIOLATION/,
    'Counselor from another school must be rejected'
  );

  // ۴. معلم: به صورت پیش‌فرض دسترسی به پرونده بالینی مشاور ندارد
  const teacher = { id: 501, role: 'teacher', school_id: 10 };
  assert.throws(
    () => enforceInterventionAccessGuard(teacher, caseRecord),
    /INTERVENTION_ACCESS_FORBIDDEN/,
    'Teachers must not have direct access to confidential counseling notes'
  );

  // ۵. معلمی که اکشن آموزشی مشخصی به او محول شده است (با فلش actionOnly): مجاز
  const assignedTeacher = { id: 301, role: 'teacher', school_id: 10 };
  assert.strictEqual(
    enforceInterventionAccessGuard(assignedTeacher, caseRecord, { actionOnly: true }),
    true,
    'Assigned teacher should see specific action task'
  );

  // ۶. اولیا و دانش‌آموزان: دسترسی به پرونده مشاوره‌ای اکیداً ممنوع است
  const student = { id: 101, role: 'student', school_id: 10 };
  const parent = { id: 601, role: 'parent', school_id: 10 };
  assert.throws(() => enforceInterventionAccessGuard(student, caseRecord), /INTERVENTION_ACCESS_FORBIDDEN/);
  assert.throws(() => enforceInterventionAccessGuard(parent, caseRecord), /INTERVENTION_ACCESS_FORBIDDEN/);

  console.log('  ✅ اعتبارسنجی قاطع محرمانگی پرونده و مهار دسترسی غیرمجاز');
}

module.exports = { runTest };
if (require.main === module) runTest();
