/**
 * آزمون ایزولاسیون چندمستأجری و سقط قاطع نشت داده (Fail-Closed Tenant Isolation)
 */

'use strict';

const assert = require('assert');
const {
  buildSchoolIntelligenceSnapshot,
  enforceSchoolIntelligenceAccessGuard
} = require('../../../server/analytics/school-intelligence-center');

function runTest() {
  console.log('▸ تست ۹: ایزولاسیون چندمستأجری و سقط قاطع نشت داده (Fail-Closed Tenant Isolation)');

  const targetSchoolId = 10;
  const foreignSchoolId = 99;

  // ۱. نشت مدرسه در نمرات
  assert.throws(() => {
    buildSchoolIntelligenceSnapshot({
      schoolId: targetSchoolId,
      grades: [
        { school_id: foreignSchoolId, student_id: 1, score: 18 }
      ]
    });
  }, /TENANT_ISOLATION_VIOLATION/, 'Cross-school grade record must trigger fail-closed exception');

  // ۲. نشت مدرسه در جلسات حضور
  assert.throws(() => {
    buildSchoolIntelligenceSnapshot({
      schoolId: targetSchoolId,
      attendanceSessions: [
        { school_id: foreignSchoolId, student_id: 1, status: 'present' }
      ]
    });
  }, /TENANT_ISOLATION_VIOLATION/, 'Cross-school attendance session must trigger fail-closed exception');

  // ۳. نشت مدرسه در برنامه‌های کلاسی
  assert.throws(() => {
    buildSchoolIntelligenceSnapshot({
      schoolId: targetSchoolId,
      schedule: [
        { school_id: foreignSchoolId, teacher_id: 1 }
      ]
    });
  }, /TENANT_ISOLATION_VIOLATION/, 'Cross-school schedule slot must trigger fail-closed exception');

  // ۴. دسترسی مدیر مدرسه به مدرسه دیگر در گارد امنیتی
  assert.throws(() => {
    enforceSchoolIntelligenceAccessGuard({ id: 1, role: 'manager', school_id: targetSchoolId }, foreignSchoolId);
  }, /TENANT_ISOLATION_VIOLATION/, 'Manager accessing foreign school must trigger fail-closed exception');

  console.log('  ✅ مسدودسازی قاطع نشت مستأجران (Fail-Closed) در مرکز هوشمندی مدرسه');
}

module.exports = { runTest };
if (require.main === module) runTest();
