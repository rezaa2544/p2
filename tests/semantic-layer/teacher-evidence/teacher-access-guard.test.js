/**
 * آزمون گارد امنیتی دسترسی معلم و ضد نفوذ (Anti-IDOR Guard)
 */

'use strict';

const assert = require('assert');
const { enforceTeacherAccessGuard } = require('../../../server/analytics/teacher-evidence');

function runTest() {
  console.log('▸ تست ۱: گارد امنیتی دسترسی معلم و ضد نفوذ (Anti-IDOR Access Guard)');

  // ۱. دسترسی معلم به داده‌های شخصی خویش در همان مدرسه: مجاز
  const validTeacher = { id: 101, role: 'teacher', school_id: 5 };
  assert.strictEqual(
    enforceTeacherAccessGuard(validTeacher, 101, { schoolId: 5 }),
    true,
    'Teacher should be authorized to access their own evidence'
  );

  // ۲. تلاش معلم برای دسترسی به کارنامه معلم دیگر: سقط با خطای امنیتی IDOR
  assert.throws(
    () => enforceTeacherAccessGuard(validTeacher, 102, { schoolId: 5 }),
    /TEACHER_EVIDENCE_ACCESS_FORBIDDEN/,
    'Teacher must NOT be allowed to access another teacher profile'
  );

  // ۳. تلاش معلم با تداخل شناسه مدرسه: سقط با TENANT_ISOLATION_VIOLATION
  assert.throws(
    () => enforceTeacherAccessGuard(validTeacher, 101, { schoolId: 6 }),
    /TENANT_ISOLATION_VIOLATION/,
    'Teacher must not access evidence belonging to a different school'
  );

  // ۴. مدیر مدرسه خودی: مجاز
  const validManager = { id: 201, role: 'manager', school_id: 5 };
  assert.strictEqual(
    enforceTeacherAccessGuard(validManager, 101, { schoolId: 5 }),
    true,
    'Manager should be authorized to view teachers in their own school'
  );

  // ۵. تلاش مدیر برای دسترسی به معلم مدرسه دیگر: سقط با TENANT_ISOLATION_VIOLATION
  assert.throws(
    () => enforceTeacherAccessGuard(validManager, 101, { schoolId: 8 }),
    /TENANT_ISOLATION_VIOLATION/,
    'Manager must not access teachers of another school'
  );

  // ۶. بازرس آموزش و پرورش و مدیر ارشد: مجاز
  const eduOffice = { id: 301, role: 'edu_office' };
  const superadmin = { id: 1, role: 'superadmin' };
  assert.strictEqual(enforceTeacherAccessGuard(eduOffice, 101, { schoolId: 5 }), true);
  assert.strictEqual(enforceTeacherAccessGuard(superadmin, 101, { schoolId: 5 }), true);

  // ۷. نقش‌های غیرمجاز (دانش‌آموز، ولی، راننده، مشاور)
  const student = { id: 501, role: 'student', school_id: 5 };
  const parent = { id: 601, role: 'parent', school_id: 5 };
  const driver = { id: 701, role: 'driver', school_id: 5 };

  assert.throws(() => enforceTeacherAccessGuard(student, 101, { schoolId: 5 }), /TEACHER_EVIDENCE_ACCESS_FORBIDDEN/);
  assert.throws(() => enforceTeacherAccessGuard(parent, 101, { schoolId: 5 }), /TEACHER_EVIDENCE_ACCESS_FORBIDDEN/);
  assert.throws(() => enforceTeacherAccessGuard(driver, 101, { schoolId: 5 }), /TEACHER_EVIDENCE_ACCESS_FORBIDDEN/);

  console.log('  ✅ اعتبارسنجی قاطع ضد نفوذ (Anti-IDOR) و کنترل دسترسی سازمانی');
}

module.exports = { runTest };
if (require.main === module) runTest();
