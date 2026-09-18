/**
 * آزمون ۱: ساخت شناسنامه حاکمیت هوشمندی (buildGovernanceSnapshot)
 */

'use strict';

const assert = require('assert');
const {
  buildGovernanceSnapshot,
  INTELLIGENCE_HEALTH_STATUS
} = require('../../../server/analytics/intelligence-governance-dashboard');

function runTests() {
  console.log('▸ تست ۱: ساخت شناسنامه حاکمیت هوشمندی (buildGovernanceSnapshot)');

  const mockData = {
    actions: [
      {
        action_id: 'ACT-01',
        decision: 'APPROVED',
        status: 'COMPLETED',
        automated_decision: false,
        requires_human_confirmation: true,
        approval_time_hours: 6.0
      },
      {
        action_id: 'ACT-02',
        decision: 'APPROVED',
        status: 'COMPLETED',
        automated_decision: false,
        requires_human_confirmation: true,
        approval_time_hours: 4.0
      },
      {
        action_id: 'ACT-03',
        decision: 'APPROVED',
        status: 'COMPLETED',
        automated_decision: false,
        requires_human_confirmation: true,
        approval_time_hours: 5.0
      },
      {
        action_id: 'ACT-04',
        decision: 'APPROVED',
        status: 'COMPLETED',
        automated_decision: false,
        requires_human_confirmation: true,
        approval_time_hours: 7.0
      },
      {
        action_id: 'ACT-05',
        decision: 'APPROVED',
        status: 'COMPLETED',
        automated_decision: false,
        requires_human_confirmation: true,
        approval_time_hours: 6.0
      },
      {
        action_id: 'ACT-06',
        decision: 'APPROVED',
        status: 'COMPLETED',
        automated_decision: false,
        requires_human_confirmation: true,
        approval_time_hours: 8.0
      },
      {
        action_id: 'ACT-07',
        decision: 'APPROVED',
        status: 'COMPLETED',
        automated_decision: false,
        requires_human_confirmation: true,
        approval_time_hours: 5.0
      },
      {
        action_id: 'ACT-08',
        decision: 'APPROVED',
        status: 'COMPLETED',
        automated_decision: false,
        requires_human_confirmation: true,
        approval_time_hours: 4.0
      },
      {
        action_id: 'ACT-09',
        decision: 'APPROVED',
        status: 'COMPLETED',
        automated_decision: false,
        requires_human_confirmation: true,
        approval_time_hours: 5.0
      },
      {
        action_id: 'ACT-10',
        decision: 'REJECTED',
        rejected_reason: 'MISDIAGNOSIS',
        status: 'CANCELLED',
        automated_decision: false,
        requires_human_confirmation: true,
        approval_time_hours: 12.0
      }
    ],
    insights: [
      { insight_id: 'INS-01', evidence: ['GRADE_DROP_SIGNAL'], action_recommended: true }
    ],
    explainability: 95.0,
    audit_coverage: 98.0,
    data_completeness_pct: 94.0
  };

  const snapshot = buildGovernanceSnapshot({
    schoolId: 101,
    regionId: 12,
    academicYear: '1405-1406',
    data: mockData,
    options: { timestamp: '2026-09-18T12:00:00.000Z' }
  });

  assert.strictEqual(snapshot.school_id, 101);
  assert.strictEqual(snapshot.region_id, 12);
  assert.strictEqual(snapshot.academic_year, '1405-1406');
  assert.strictEqual(snapshot.automated_decision, false, 'تصمیم خودکار باید اکیداً false باشد');
  assert.strictEqual(snapshot.human_controlled_policy, true, 'کنترل انسانی خط‌مشی‌ها باید true باشد');
  assert.strictEqual(snapshot.zero_ranking, true, 'رتبه‌بندی رقابتی باید اکیداً ممنوع باشد');

  assert.ok(snapshot.transparency_score);
  assert.strictEqual(snapshot.transparency_score.level, 'EXCELLENT');
  assert.ok(snapshot.intelligence_health);
  assert.strictEqual(snapshot.intelligence_health.status, INTELLIGENCE_HEALTH_STATUS.HEALTHY);

  assert.strictEqual(snapshot.human_control_metrics.approval_rate_pct, 90.0);
  assert.strictEqual(snapshot.human_control_metrics.violations_detected, 0);

  console.log('  ✅ شناسنامه حاکمیت با ابعاد سلامت، شفافیت، و نظارت انسانی با موفقیت ساخته شد');
}

if (require.main === module) {
  runTests();
}

module.exports = { runTests };
