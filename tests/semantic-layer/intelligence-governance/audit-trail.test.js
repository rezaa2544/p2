/**
 * آزمون ۴: ثبت رویدادهای ممیزی بدون نشت داده‌های حساس (recordGovernanceAuditEvent)
 */

'use strict';

const assert = require('assert');
const {
  recordGovernanceAuditEvent,
  AUDIT_EVENT_TYPE
} = require('../../../server/analytics/intelligence-governance-dashboard');

function runTests() {
  console.log('▸ تست ۴: ثبت رویدادهای ممیزی بدون نشت داده‌های حساس (recordGovernanceAuditEvent)');

  const eventPayload = {
    actor_id: 'usr-manager-01',
    role: 'manager',
    action_type: AUDIT_EVENT_TYPE.ACTION_APPROVAL,
    entity_type: 'recommendation',
    entity_id: 'REC-101-01',
    before_state: 'REVIEW_PENDING',
    after_state: 'APPROVED',
    reason: 'جلسه با ولی دانش‌آموز برگزار شد و پرونده بالینی و پزشکی او بررسی گردید. کد ملی: ۰۰۱۲۳۴۵۶۷۸'
  };

  const auditRecord = recordGovernanceAuditEvent(eventPayload, { timestamp: '2026-09-18T12:00:00.000Z' });

  assert.strictEqual(auditRecord.actor_id, 'usr-manager-01');
  assert.strictEqual(auditRecord.role, 'manager');
  assert.strictEqual(auditRecord.action_type, 'ACTION_APPROVAL');
  assert.strictEqual(auditRecord.before_state, 'REVIEW_PENDING');
  assert.strictEqual(auditRecord.after_state, 'APPROVED');
  assert.strictEqual(auditRecord.privacy_scrubbed, true);

  // اطمینان از پاکسازی متن از داده‌های حساس
  assert.ok(!auditRecord.reason.includes('۰۰۱۲۳۴۵۶۷۸'), 'کد ملی نباید در لاگ ممیزی باقی بماند');
  assert.ok(!auditRecord.reason.includes('پرونده بالینی'), 'اصطلاحات بالینی باید سانسور شوند');
  assert.ok(!auditRecord.reason.includes('پزشکی'), 'اصطلاحات پزشکی باید سانسور شوند');
  assert.ok(auditRecord.reason.includes('[محرمانه-حذف‌شده]'), 'برچسب جایگزین محرمانه باید درج شود');

  console.log('  ✅ ثبت ساختاریافته رویداد و پاکسازی حریم خصوصی با موفقیت تأیید شد');
}

if (require.main === module) {
  runTests();
}

module.exports = { runTests };
