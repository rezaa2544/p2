/**
 * tests/infrastructure/certification/tenant-isolation.test.js
 * آزمون گارد تفکیک چندمستأجری و سقط شکست‌ایمن (Fail-Closed Multi-Tenancy)
 */

'use strict';

const assert = require('assert');
const {
  PHASE4_ERRORS,
  enforcePhase4CertificationAccessGuard
} = require('../../../server/infrastructure/phase4-release-certification');

console.log('--- آزمون تفکیک چندمستأجری و شکست‌ایمن گیت انتشار ---');

// ۱. عدم احراز هویت -> سقط با خطا
assert.throws(() => {
  enforcePhase4CertificationAccessGuard(null, { school_id: 1 });
}, (err) => {
  assert.strictEqual(err.code, PHASE4_ERRORS.ROLE_ACCESS_DENIED);
  return true;
});

// ۲. نقش غیرمجاز (دانش‌آموز) -> سقط با خطا
assert.throws(() => {
  enforcePhase4CertificationAccessGuard({ role: 'student', school_id: 1 }, { school_id: 1 });
}, (err) => {
  assert.strictEqual(err.code, PHASE4_ERRORS.ROLE_ACCESS_DENIED);
  return true;
});

// ۳. سوپرادمین -> دسترسی کامل به هر مدرسه و منطقه
const superadmin = { role: 'superadmin', id: 99 };
assert.strictEqual(
  enforcePhase4CertificationAccessGuard(superadmin, { school_id: 42, region_id: 9 }),
  true,
  'سوپرادمین باید دسترسی کامل داشته باشد'
);

// ۴. مدیر مدرسه به مدرسه خودش -> مجاز
const managerSchool1 = { role: 'manager', school_id: 1, id: 10 };
assert.strictEqual(
  enforcePhase4CertificationAccessGuard(managerSchool1, { school_id: 1 }),
  true
);

// ۵. مدیر مدرسه به مدرسه دیگر -> سقط با خطای نقض ایزولاسیون (Anti-IDOR)
assert.throws(() => {
  enforcePhase4CertificationAccessGuard(managerSchool1, { school_id: 2 });
}, (err) => {
  assert.strictEqual(err.code, PHASE4_ERRORS.TENANT_ISOLATION_VIOLATION);
  return true;
});

// ۶. مسئول اداره آموزش و پرورش منطقه به منطقه خودش -> مجاز
const eduOfficeReg1 = { role: 'edu_office', region_id: 1, id: 20 };
assert.strictEqual(
  enforcePhase4CertificationAccessGuard(eduOfficeReg1, { region_id: 1 }),
  true
);

// ۷. مسئول اداره منطقه به منطقه دیگر -> سقط با خطای نقض ایزولاسیون منطقه
assert.throws(() => {
  enforcePhase4CertificationAccessGuard(eduOfficeReg1, { region_id: 2 });
}, (err) => {
  assert.strictEqual(err.code, PHASE4_ERRORS.TENANT_ISOLATION_VIOLATION);
  return true;
});

console.log('✅ ۶/۹: تفکیک چندمستأجری و سقط شکست‌ایمن با موفقیت تایید شد');
