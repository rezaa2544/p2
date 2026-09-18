/**
 * آزمون ۵: گیت‌های امنیتی و تفکیک چندمستأجری (security-gates)
 */

'use strict';

const assert = require('assert');
const {
  enforceCertificationAccessGuard
} = require('../../../server/analytics/intelligence-release-certification');

function runTests() {
  console.log('▸ تست ۵: گیت‌های امنیتی و تفکیک چندمستأجری شکست ایمن (security-gates)');

  // ۱. دسترسی مجاز مدیر سامانه (superadmin / admin)
  const superadmin = { id: 1, role: 'superadmin' };
  const admin = { id: 2, role: 'admin' };
  assert.strictEqual(enforceCertificationAccessGuard(superadmin, { school_id: 101 }), true);
  assert.strictEqual(enforceCertificationAccessGuard(admin, { region_id: 2 }), true);

  // ۲. دسترسی مجاز مدیر مدرسه به مدرسه خود
  const schoolManager = { id: 10, role: 'manager', school_id: 101 };
  assert.strictEqual(enforceCertificationAccessGuard(schoolManager, { school_id: 101 }), true);

  // ۳. سقط قاطع تلاش برای نفوذ IDOR بین مدارس (Fail-Closed)
  assert.throws(() => {
    enforceCertificationAccessGuard(schoolManager, { school_id: 102 });
  }, /INTELLIGENCE_CERTIFICATION_TENANT_ISOLATION_VIOLATION/, 'دسترسی مدیر مدرسه به مدرسه دیگر باید بلافاصله سقط شود');

  // ۴. دسترسی مجاز اداره منطقه به منطقه خود
  const eduOffice = { id: 20, role: 'edu_office', region_id: 1 };
  assert.strictEqual(enforceCertificationAccessGuard(eduOffice, { region_id: 1 }), true);

  // ۵. سقط قاطع تلاش اداره برای نفوذ به منطقه دیگر
  assert.throws(() => {
    enforceCertificationAccessGuard(eduOffice, { region_id: 2 });
  }, /INTELLIGENCE_CERTIFICATION_TENANT_ISOLATION_VIOLATION/, 'دسترسی اداره به منطقه دیگر باید بلافاصله سقط شود');

  // ۶. سقط قاطع نقش‌های غیرمجاز (مانند دانش‌آموز یا ولی)
  const student = { id: 30, role: 'student', school_id: 101 };
  assert.throws(() => {
    enforceCertificationAccessGuard(student, { school_id: 101 });
  }, /INTELLIGENCE_CERTIFICATION_ROLE_ACCESS_DENIED/, 'نقش دانش‌آموز نباید دسترسی داشته باشد');

  const parent = { id: 40, role: 'parent', school_id: 101 };
  assert.throws(() => {
    enforceCertificationAccessGuard(parent, { school_id: 101 });
  }, /INTELLIGENCE_CERTIFICATION_ROLE_ACCESS_DENIED/, 'نقش والد نباید دسترسی داشته باشد');

  // ۷. سقط قاطع در نبود کاربر (Unauthenticated)
  assert.throws(() => {
    enforceCertificationAccessGuard(null, { school_id: 101 });
  }, /INTELLIGENCE_CERTIFICATION_ROLE_ACCESS_DENIED/);

  console.log('  ✅ عایق‌بندی چندمستأجری و کنترل نقش‌ها با کدهای خطای مصوب تایید شد');
}

if (require.main === module) {
  runTests();
}

module.exports = { runTests };
