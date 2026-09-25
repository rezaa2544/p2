'use strict';

const assert = require('assert');
const { checkIntelligenceChainHealth, buildUnifiedIntelligenceSnapshot } = require('../../server/analytics/intelligence-platform-integration');
const { auditHumanApprovalCompliance } = require('../../server/analytics/intelligence-governance-dashboard');
const { analyzeRecommendationAccuracy } = require('../../server/analytics/intelligence-feedback-memory');
const { buildParent360Profile } = require('../../server/analytics/parent-360');
const { buildRegionalSnapshot } = require('../../server/analytics/regional-intelligence-network');
const { executeEndToEndChain, generatePhase3ReleaseCertificate } = require('../../server/analytics/intelligence-release-certification');

function run() {
  // I-02: absence of evidence/data is not positive health.
  const emptyChain = checkIntelligenceChainHealth({ engineOutputs: {} });
  assert.notStrictEqual(emptyChain.chain_status, 'HEALTHY');
  assert.strictEqual(emptyChain.integrity_checks.evidence_presence, false);
  const emptyGov = auditHumanApprovalCompliance([]);
  assert.strictEqual(emptyGov.approval_rate_pct, null);
  assert.strictEqual(emptyGov.compliance_status, 'NO_DATA');

  // I-03: peak day is derived only from observed absence records.
  const regional = buildRegionalSnapshot({
    regionId: 1,
    academicYear: '1405-1406',
    schools: [{
      school_id: 10,
      region_id: 1,
      attendance_summary: { calendar_rate: null, chronic_absence_rate: null, peak_absence_day: null },
      academic_summary: { average_gpa: null, at_risk_subjects_count: 0 },
      assessment_summary: { total_exams_analyzed: 0, hard_exams_count: 0 },
      intervention_summary: { active_cases_count: 0, unassigned_high_priority_count: 0, resolution_rate: null },
      teacher_summary: { overloaded_teachers_count: 0 },
      risk_summary: { critical_count: 0, high_count: 0, medium_count: 0 }
    }]
  });
  assert.strictEqual(regional.attendance_patterns.peak_absence_day, null);

  // I-04: zero attendance is 0%, not excellent.
  const parent = buildParent360Profile({
    parent: { id: 1 }, student: { id: 2, parent_id: 1, school_id: 10 },
    parentLinks: [{ parent_id: 1, student_id: 2 }],
    attendance: [{ school_id: 10, status: 'absent' }],
    grades: [], timeline: []
  });
  assert.strictEqual(parent.attendance_overview.attendance_rate, 0);
  assert.strictEqual(parent.attendance_overview.status, 'CRITICAL');

  const noAttendance = buildParent360Profile({
    parent: { id: 1 }, student: { id: 2, parent_id: 1, school_id: 10 },
    parentLinks: [{ parent_id: 1, student_id: 2 }],
    attendance: [], grades: [], timeline: []
  });
  assert.strictEqual(noAttendance.attendance_overview.attendance_rate, null);
  assert.strictEqual(noAttendance.attendance_overview.status, 'NO_DATA');

  // I-06: zero escalations means unknown accuracy, not 100%.
  assert.strictEqual(analyzeRecommendationAccuracy([]).escalation_accuracy_pct, null);

  // I-07/I-08: platform chain cannot be green from || true or hard-coded metrics.
  const missing = checkIntelligenceChainHealth({ engineOutputs: {} });
  assert.strictEqual(missing.nodes.insight_engines_present, false);
  const snapshot = buildUnifiedIntelligenceSnapshot({ schoolId: 10, regionId: 1, engineOutputs: {} });
  assert.strictEqual(snapshot.summary_metrics.school_intelligence_score, null);
  assert.strictEqual(snapshot.summary_metrics.health_index, null);
  assert.strictEqual(snapshot.summary_metrics.decision_items_count, null);

  // I-09: synthetic chain is explicitly non-verified and cannot certify.
  const e2e = executeEndToEndChain({ school_id: 10, region_id: 1 }, { timestamp: '2026-09-25T00:00:00.000Z' });
  assert.strictEqual(e2e.verified, false);
  assert.strictEqual(e2e.execution_mode, 'SYNTHETIC_SIMULATION');
  const cert = generatePhase3ReleaseCertificate({
    completeness: { complete: true, total_required: 20, active_count: 20, catalog_snapshot: [] },
    qualityGates: { all_passed: true, total_gates: 1, passed_gates: 1 },
    sovereignty: { compliant: true, checks: { automated_decision_prohibited: true, automated_execution_prohibited: true, requires_human_approval_enforced: true } },
    zeroRanking: { compliant: true },
    e2eChain: e2e
  }, { timestamp: '2026-09-25T00:00:00.000Z' });
  assert.strictEqual(cert.release_ready, false);
  assert.strictEqual(cert.status, 'REJECTED');

  console.log('A-31 semantic/certification integrity regression: PASS');
}

if (require.main === module) run();
module.exports = { run };
