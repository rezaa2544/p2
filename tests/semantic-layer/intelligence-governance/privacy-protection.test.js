/**
 * آزمون ۶: حفاظت از حریم خصوصی و عدم نشت اطلاعات فردی (Privacy Protection)
 */

'use strict';

const assert = require('assert');
const {
  buildGovernanceSnapshot,
  recordGovernanceAuditEvent
} = require('../../../server/analytics/intelligence-governance-dashboard');

function runTests() {
  console.log('▸ تست ۶: حفاظت از حریم خصوصی و عدم نشت اطلاعات فردی (Privacy Protection)');

  const mockData = {
    actions: [
      {
        action_id: 'ACT-01',
        decision: 'APPROVED',
        status: 'COMPLETED',
        student_id: 998877, // نباید در خروجی شناسنامه حاکمیت نشت کند
        national_id: '1234567890'
      }
    ]
  };

  const snapshot = buildGovernanceSnapshot({
    schoolId: 101,
    regionId: 1,
    data: mockData
  });

  assert.strictEqual(snapshot.privacy_status.student_pii_masked, true);
  assert.strictEqual(snapshot.privacy_status.clinical_notes_stripped, true);
  assert.strictEqual(snapshot.privacy_status.compliance_score, 100.0);

  const serialized = JSON.stringify(snapshot);
  assert.ok(!serialized.includes('998877'), 'شناسه دانش‌آموز نباید در شناسنامه حاکمیت نشت کند');
  assert.ok(!serialized.includes('1234567890'), 'کد ملی نباید در شناسنامه حاکمیت نشت کند');

  // آزمون پالایش در ثبت رویداد ممیزی
  const audit = recordGovernanceAuditEvent({
    entity_id: '101',
    reason: 'پرونده پزشکی و داروهای تجویزی دانش‌آموز توسط پزشک بررسی شد'
  });

  assert.ok(!audit.reason.includes('پزشکی'));
  assert.ok(!audit.reason.includes('دارو'));
  assert.ok(audit.privacy_scrubbed);

  console.log('  ✅ تضمین قطعی عدم نشت اطلاعات هویتی و پالایش اصطلاحات حساس تأیید شد');
}

if (require.main === module) {
  runTests();
}

module.exports = { runTests };
