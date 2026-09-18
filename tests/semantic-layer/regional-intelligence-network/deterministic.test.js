/**
 * آزمون قطعیت و بازتولیدپذیری بیت‌به‌بیت (Deterministic 10-Execution Integrity)
 */

'use strict';

const assert = require('assert');
const {
  buildRegionalSnapshot,
  calculateRegionalNeeds,
  detectRegionalPatterns,
  generateRegionalActionPlan,
  summarizeRegionalHealth
} = require('../../../server/analytics/regional-intelligence-network');

function runTest() {
  console.log('▸ تست ۷: آزمون قطعیت و بازتولیدپذیری بیت‌به‌بیت (Deterministic 10-Execution)');

  const fixedNow = '2026-09-18T12:00:00.000Z';
  const regionContext = {
    regionId: 3,
    academicYear: '1405-1406',
    schools: [
      {
        school_id: 101,
        health_index: { status: 'HEALTHY' },
        attendance_summary: { calendar_rate: 94.0, chronic_absence_rate: 4.0, peak_absence_day: 'wednesday' },
        academic_summary: { average_gpa: 16.0, at_risk_subjects_count: 0 },
        assessment_summary: { total_exams_analyzed: 12, hard_exams_count: 1 },
        intervention_summary: { active_cases_count: 5, unassigned_high_priority_count: 1, resolution_rate: 80.0 },
        teacher_summary: { overloaded_teachers_count: 0 },
        risk_summary: { critical_count: 0, high_count: 1, medium_count: 2 }
      },
      {
        school_id: 102,
        health_index: { status: 'NEEDS_MONITORING' },
        attendance_summary: { calendar_rate: 86.0, chronic_absence_rate: 11.0, peak_absence_day: 'wednesday' },
        academic_summary: { average_gpa: 13.5, at_risk_subjects_count: 1 },
        assessment_summary: { total_exams_analyzed: 10, hard_exams_count: 2 },
        intervention_summary: { active_cases_count: 9, unassigned_high_priority_count: 0, resolution_rate: 65.0 },
        teacher_summary: { overloaded_teachers_count: 1 },
        risk_summary: { critical_count: 0, high_count: 2, medium_count: 3 }
      }
    ]
  };

  let baseSnapshot, baseHealth, baseNeeds, basePatterns, basePlan;

  for (let i = 0; i < 10; i++) {
    const snapshot = buildRegionalSnapshot(regionContext, { now: fixedNow });
    const health = summarizeRegionalHealth(regionContext);
    const needs = calculateRegionalNeeds(regionContext);
    const patterns = detectRegionalPatterns(regionContext);
    const plan = generateRegionalActionPlan({ resource_needs: needs });

    const sSnapshot = JSON.stringify(snapshot);
    const sHealth = JSON.stringify(health);
    const sNeeds = JSON.stringify(needs);
    const sPatterns = JSON.stringify(patterns);
    const sPlan = JSON.stringify(plan);

    if (i === 0) {
      baseSnapshot = sSnapshot;
      baseHealth = sHealth;
      baseNeeds = sNeeds;
      basePatterns = sPatterns;
      basePlan = sPlan;
    } else {
      assert.strictEqual(sSnapshot, baseSnapshot, `Snapshot mismatch at iteration ${i}`);
      assert.strictEqual(sHealth, baseHealth, `Health mismatch at iteration ${i}`);
      assert.strictEqual(sNeeds, baseNeeds, `Needs mismatch at iteration ${i}`);
      assert.strictEqual(sPatterns, basePatterns, `Patterns mismatch at iteration ${i}`);
      assert.strictEqual(sPlan, basePlan, `Plan mismatch at iteration ${i}`);
    }
  }

  console.log('  ✅ قطعیت ۱۰۰٪: ده اجرای متوالی تمامی توابع خروجی‌های بیت‌به‌بیت یکسان تولید کردند');
}

module.exports = { runTest };
if (require.main === module) runTest();
