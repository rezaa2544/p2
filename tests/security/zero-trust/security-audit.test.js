/**
 * تست موتور ممیزی و پالایش داده‌های حساس (Security Audit Engine - P1-SC-06)
 */
'use strict';

const assert = require('assert');
const {
  maskPhone,
  maskNationalId,
  sanitizeSecurityPayload,
  recordSecurityEvent,
  getSecurityAuditTrail,
  clearAuditTrailForTests
} = require('../../../server/security/security-audit-engine');

function runSecurityAuditTests() {
  console.log('▸ تست ۵: موتور ممیزی و پالایش کامل داده‌های حساس (security-audit)');

  clearAuditTrailForTests();

  // ۱. تست ماسک کردن شماره تلفن و کد ملی
  assert.strictEqual(maskPhone('09121234567'), '0912***4567');
  assert.strictEqual(maskNationalId('0012345678'), '001****678');

  // ۲. تست پالایش عمیق داده‌های حساس (رمز، توکن، شماره‌ها)
  const dirtyPayload = {
    user: 'reza',
    password: 'SuperSecretPassword123!',
    token: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.dummy',
    secret: 'my_secret_key',
    phone: '09129876543',
    national_id: '0123456789',
    nested: {
      jwt: 'token_val',
      note: 'تماس با 09351112233 و کد ملی 1234567890'
    }
  };

  const cleanPayload = sanitizeSecurityPayload(dirtyPayload);
  assert.strictEqual(cleanPayload.password, '[REDACTED_SECRET]');
  assert.strictEqual(cleanPayload.token, '[REDACTED_SECRET]');
  assert.strictEqual(cleanPayload.secret, '[REDACTED_SECRET]');
  assert.strictEqual(cleanPayload.phone, '0912***6543');
  assert.strictEqual(cleanPayload.national_id, '012****789');
  assert.strictEqual(cleanPayload.nested.jwt, '[REDACTED_SECRET]');
  assert(cleanPayload.nested.note.includes('0935***2233'));
  assert(cleanPayload.nested.note.includes('123****890'));

  // ۳. ثبت رویدادهای ممیزی
  const ev1 = recordSecurityEvent({
    event_type: 'AUTH_LOGIN_SUCCESS',
    action: 'LOGIN',
    user_id: 10,
    role: 'manager',
    school_id: 1,
    ip: '192.168.1.5',
    details: dirtyPayload
  });

  assert.strictEqual(ev1.event_type, 'AUTH_LOGIN_SUCCESS');
  assert.strictEqual(ev1.details.password, '[REDACTED_SECRET]');
  assert.strictEqual(ev1.governance.human_decision_sovereignty, true);

  // ۴. بازیابی و فیلتر ردپای ممیزی
  recordSecurityEvent({
    event_type: 'AUTH_LOGOUT',
    action: 'LOGOUT',
    user_id: 20,
    role: 'teacher',
    school_id: 2
  });

  const trailSchool1 = getSecurityAuditTrail({ schoolId: 1 });
  assert.strictEqual(trailSchool1.length, 1);
  assert.strictEqual(trailSchool1[0].school_id, 1);

  const trailAll = getSecurityAuditTrail();
  assert.strictEqual(trailAll.length, 2);

  console.log('  ✅ صحت ممیزی، پالایش صددرصدی داده‌های حساس و فیلتر لاگ‌ها تایید شد');
}

if (require.main === module) {
  runSecurityAuditTests();
}

module.exports = { runSecurityAuditTests };
