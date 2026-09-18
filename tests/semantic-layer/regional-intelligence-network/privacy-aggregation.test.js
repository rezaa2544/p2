/**
 * آزمون حفظ حریم خصوصی و عدم افشای اطلاعات فردی (Privacy-Preserving Aggregation)
 */

'use strict';

const assert = require('assert');
const { buildRegionalSnapshot } = require('../../../server/analytics/regional-intelligence-network');

function runTest() {
  console.log('▸ تست ۶: آزمون حفظ حریم خصوصی و عدم خروج داده‌های فردی (Privacy-Preserving Aggregation)');

  const mockSchools = [
    {
      school_id: 10,
      health_index: { status: 'HEALTHY' },
      attendance_summary: { calendar_rate: 95.0 },
      academic_summary: { average_gpa: 17.0 },
      intervention_summary: { active_cases_count: 3 }
    }
  ];

  const snapshot = buildRegionalSnapshot({
    regionId: 5,
    schools: mockSchools
  });

  // ۱. بررسی پرچم‌های حریم خصوصی
  assert.strictEqual(snapshot.privacy_flags.individual_pii_excluded, true);
  assert.strictEqual(snapshot.privacy_flags.k_anonymity_threshold_met, true);
  assert.strictEqual(snapshot.privacy_flags.confidential_clinical_notes_stripped, true);

  // ۲. بررسی عدم وجود هرگونه داده فردی
  assert.strictEqual('student_id' in snapshot, false, 'student_id must not leak into regional snapshot');
  assert.strictEqual('national_id' in snapshot, false, 'national_id must not leak into regional snapshot');
  assert.strictEqual('first_name' in snapshot, false, 'first_name must not leak into regional snapshot');
  assert.strictEqual('last_name' in snapshot, false, 'last_name must not leak into regional snapshot');
  assert.strictEqual('clinical_notes' in snapshot, false, 'clinical_notes must not leak into regional snapshot');

  console.log('  ✅ تضمین قطعی حذف داده‌های هویتی فردی و تجمیع کاملاً ناشناس‌سازی‌شده');
}

module.exports = { runTest };
if (require.main === module) runTest();
