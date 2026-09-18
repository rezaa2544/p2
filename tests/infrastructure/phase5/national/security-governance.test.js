/**
 * tests/infrastructure/phase5/national/security-governance.test.js
 * آزمون راهبری امنیت ملی، اعتماد صفر و مهار نفوذ (P2-NI-01)
 */

'use strict';

const assert = require('assert');
const {
  enforceNationalSecurityBoundary,
  recordNationalAuditTrail,
  getNationalAuditTrail,
  NATIONAL_SECURITY_ERRORS
} = require('../../../../server/security/national-security-governance');

console.log('--- آزمون راهبری امنیت و مرزهای ملی ---');

// ۱. دسترسی مجاز سوپرادمین
const admin = { id: 1, role: 'superadmin' };
assert.strictEqual(enforceNationalSecurityBoundary({
  user: admin,
  target_school_id: 101,
  target_region_id: 'ir-tehran-1'
}), true);

// ۲. نقض مرز مستأجر مدرسه (Anti-IDOR) -> PHASE5_NATIONAL_TENANT_ISOLATION_FAILURE
const manager = { id: 10, role: 'manager', school_id: 101 };
assert.throws(() => {
  enforceNationalSecurityBoundary({
    user: manager,
    target_school_id: 202
  });
}, (err) => {
  assert.strictEqual(err.code, NATIONAL_SECURITY_ERRORS.TENANT_ISOLATION_FAILURE);
  return true;
});

// ۳. نقض مرز منطقه اداره آموزش و پرورش -> PHASE5_NATIONAL_REGION_ACCESS_DENIED
const eduOffice = { id: 20, role: 'edu_office', region_id: 'ir-isfahan-1' };
assert.throws(() => {
  enforceNationalSecurityBoundary({
    user: eduOffice,
    target_region_id: 'ir-tabriz-1'
  });
}, (err) => {
  assert.strictEqual(err.code, NATIONAL_SECURITY_ERRORS.REGION_ACCESS_DENIED);
  return true;
});

// ۴. ثبت و واکشی لاگ حسابرسی
const auditRecord = recordNationalAuditTrail('SYSTEM_AUDIT_TEST', admin, { detail: 'test' });
assert.ok(auditRecord.audit_id);
assert.ok(auditRecord.hash);

const auditList = getNationalAuditTrail(5);
assert.ok(auditList.length > 0);

console.log('✅ ۴/۷: راهبری امنیت ملی و مهار نفوذ با موفقیت تایید شد');
