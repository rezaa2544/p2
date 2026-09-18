/**
 * آزمون ۵: مرکز هشدارهای چندسطحی حاکمیتی (generateGovernanceAlerts)
 */

'use strict';

const assert = require('assert');
const {
  generateGovernanceAlerts,
  ALERT_SEVERITY
} = require('../../../server/analytics/intelligence-governance-dashboard');

function runTests() {
  console.log('▸ تست ۵: مرکز هشدارهای چندسطحی حاکمیتی (generateGovernanceAlerts)');

  // حالت ۱: وجود تخلف بحرانی
  const critData = {
    school_id: 101,
    violations_detected: 1,
    tenant_violations_detected: 0,
    approval_rate_pct: 95.0,
    rejection_rate_pct: 5.0,
    evidence_coverage_pct: 90.0,
    unreviewed_count: 2,
    data_completeness_pct: 95.0
  };

  const critAlerts = generateGovernanceAlerts(critData);
  assert.strictEqual(critAlerts.length, 1);
  assert.strictEqual(critAlerts[0].severity, ALERT_SEVERITY.CRITICAL);
  assert.strictEqual(critAlerts[0].code, 'GOVERNANCE_POLICY_VIOLATION');

  // حالت ۲: هشدارهای سطح بالا و متوسط (افت نرخ تأیید و انباشت کارهای بررسی‌نشده)
  const degradedData = {
    school_id: 101,
    violations_detected: 0,
    tenant_violations_detected: 0,
    approval_rate_pct: 65.0, // < 70 -> HIGH
    rejection_rate_pct: 45.0, // > 40 -> HIGH
    evidence_coverage_pct: 55.0, // < 60 -> HIGH
    unreviewed_count: 15, // > 10 -> MEDIUM
    data_completeness_pct: 75.0 // < 80 -> MEDIUM
  };

  const degradedAlerts = generateGovernanceAlerts(degradedData);
  assert.strictEqual(degradedAlerts.length, 5);

  const codes = degradedAlerts.map(a => a.code);
  assert.ok(codes.includes('LOW_HUMAN_APPROVAL_RATE'));
  assert.ok(codes.includes('HIGH_RECOMMENDATION_REJECTION_RATE'));
  assert.ok(codes.includes('LOW_EVIDENCE_COVERAGE'));
  assert.ok(codes.includes('UNREVIEWED_ACTION_BACKLOG'));
  assert.ok(codes.includes('DATA_COMPLETENESS_DEGRADED'));

  console.log('  ✅ تولید دقیق هشدارهای چندسطحی CRITICAL، HIGH و MEDIUM با موفقیت تأیید شد');
}

if (require.main === module) {
  runTests();
}

module.exports = { runTests };
