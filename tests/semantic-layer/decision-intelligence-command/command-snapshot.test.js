/**
 * آزمون ۱: ساخت شناسنامه ارکستراسیون فرماندهی تصمیم (buildDecisionCommandSnapshot)
 */

'use strict';

const assert = require('assert');
const {
  buildDecisionCommandSnapshot,
  DECISION_WORKFLOW_STATE,
  DECISION_URGENCY
} = require('../../../server/analytics/decision-intelligence-command');

function runTests() {
  console.log('▸ تست ۱: ساخت شناسنامه ارکستراسیون فرماندهی (command-snapshot)');

  const mockOutputs = {
    schoolIntelligence: { school_id: 101, health_status: 'HEALTHY' },
    regionalNetwork: { region_id: 12 },
    qualityGovernance: { status: 'COMPLIANT' },
    longitudinalMonitoring: { trend: 'IMPROVING' },
    recommendationEngine: { recommendations_count: 5 },
    feedbackMemory: { maturity_score: 85 },
    governanceDashboard: { transparency_score: 90 },
    policySimulation: { simulation_id: 'SIM-001' },
    decisions: [
      {
        decision_id: 'DEC-01',
        title: 'مداخله فوری حضور برای دانش‌آموزان با افت ناگهانی',
        domain: 'ATTENDANCE',
        workflow_state: DECISION_WORKFLOW_STATE.HUMAN_REVIEW_REQUIRED,
        urgency: DECISION_URGENCY.IMMEDIATE_24H,
        evidence_strength: 95,
        affected_scope: 50,
        intervention_readiness: 90,
        human_owner_available: true,
        assigned_role: 'counselor',
        evidence_summary: ['۳ جلسه غیبت متوالی']
      }
    ]
  };

  const snapshot = buildDecisionCommandSnapshot({
    schoolId: 101,
    regionId: 12,
    academicYear: '1405-1406',
    engineOutputs: mockOutputs,
    options: { timestamp: '2026-09-18T12:00:00.000Z' }
  });

  assert.strictEqual(snapshot.school_id, 101);
  assert.strictEqual(snapshot.region_id, 12);
  assert.strictEqual(snapshot.academic_year, '1405-1406');
  assert.strictEqual(snapshot.automated_decision, false, 'تصمیم‌گیری خودکار باید اکیداً false باشد');
  assert.strictEqual(snapshot.requires_human_approval, true, 'تأیید انسانی باید صراحتاً true باشد');
  assert.strictEqual(snapshot.zero_ranking, true, 'رتبه‌بندی رقابتی باید اکیداً ممنوع باشد');

  assert.ok(snapshot.command_board);
  assert.strictEqual(snapshot.command_board.critical_decisions_pending_review.length, 1);
  assert.strictEqual(snapshot.engine_inputs_summary.school_intelligence_present, true);
  assert.strictEqual(snapshot.engine_inputs_summary.policy_simulation_present, true);

  console.log('  ✅ تجمیع ۸ موتور هوشمندی در شناسنامه فرماندهی با موفقیت تأیید شد');
}

if (require.main === module) {
  runTests();
}

module.exports = { runTests };
