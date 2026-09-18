/**
 * آزمون ۹: ایمنی در برابر جهش داده‌ها و فریز عمیق اشیا (deepFreeze Mutation Safety)
 */

'use strict';

const assert = require('assert');
const {
  evaluateOperationalOutcome,
  calculateInterventionImpactScore,
  detectLearningPatterns,
  updateOrganizationalLearningMemory,
  generateOptimizationInsights,
  buildOutcomeEvaluationSnapshot
} = require('../../../server/analytics/outcome-evaluation-optimization');

function runTests() {
  console.log('▸ تست ۹: آزمون ایمنی در برابر جهش داده‌ها و فریز عمیق اشیا (mutation-safety)');

  const frozenTask = Object.freeze({
    task_id: 'TASK-FRZ',
    decision_id: 'DEC-FRZ',
    title: 'وظیفه منجمد',
    domain: 'ACADEMIC'
  });

  const outcome = evaluateOperationalOutcome({
    task: frozenTask,
    baselineMetrics: Object.freeze({ attendance_pct: 80, gpa: 14 }),
    postMetrics: Object.freeze({ attendance_pct: 85, gpa: 15 })
  });

  assert.ok(Object.isFrozen(outcome));
  assert.ok(Object.isFrozen(outcome.delta_metrics));

  assert.throws(() => {
    outcome.impact_score = 999;
  }, /TypeError/);

  const score = calculateInterventionImpactScore({ outcomeImprovement: 70 });
  assert.ok(Object.isFrozen(score));

  const patterns = detectLearningPatterns(Object.freeze([outcome]));
  assert.ok(Object.isFrozen(patterns));
  if (patterns.length > 0) assert.ok(Object.isFrozen(patterns[0]));

  const memory = updateOrganizationalLearningMemory(Object.freeze({ interventions_history: Object.freeze([]) }), outcome);
  assert.ok(Object.isFrozen(memory));

  const insights = generateOptimizationInsights(Object.freeze({ schoolId: 101 }));
  assert.ok(Object.isFrozen(insights));

  const snapshot = buildOutcomeEvaluationSnapshot({ schoolId: 101, evaluations: Object.freeze([outcome]) });
  assert.ok(Object.isFrozen(snapshot));
  assert.ok(Object.isFrozen(snapshot.impact_distribution));
  assert.ok(Object.isFrozen(snapshot.overall_delta_summary));

  console.log('  ✅ ایمنی کامل در برابر جهش غیرمجاز و انجماد عمیق ساختارها تأیید شد');
}

if (require.main === module) {
  runTests();
}

module.exports = { runTests };
