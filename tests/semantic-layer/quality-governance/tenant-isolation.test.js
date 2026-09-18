/**
 * آزمون جداسازی قطعی چندمستأجری (Tenant Isolation) در راهبری کیفیت
 */

'use strict';

const assert = require('assert');
const {
  buildQualityGovernanceReport,
  enforceQualityGovernanceAccessGuard
} = require('../../../server/analytics/quality-governance');

function runTest() {
  console.log('▸ تست ۹: جداسازی چندمستأجری (Tenant Isolation) و منع دسترسی بین مدرسه‌ای و بین منطقه‌ای');

  // ۱. بررسی تفکیک مدرسه: مدیر مدرسه ۱ نمی‌تواند گزارش مدرسه ۲ را ببیند
  const managerSchool1 = { id: 10, role: 'manager', school_id: 1 };
  const targetSchool2 = 2;

  assert.throws(
    () => buildQualityGovernanceReport({
      actor: managerSchool1,
      school_id: targetSchool2
    }),
    /TENANT_ISOLATION_VIOLATION/,
    'School manager must not access quality report of another school'
  );

  // ۲. بررسی تفکیک منطقه: کارشناس اداره منطقه ۳ نمی‌تواند گزارش منطقه ۴ را ببیند
  const officerRegion3 = { id: 30, role: 'edu_office', region_id: 3 };
  const targetRegion4 = 4;

  assert.throws(
    () => buildQualityGovernanceReport({
      actor: officerRegion3,
      region_id: targetRegion4
    }),
    /TENANT_ISOLATION_VIOLATION/,
    'Edu officer must not access district quality summary of another region'
  );

  // ۳. کاربر فاقد شناسه مدرسه نمی‌تواند درخواست گزارش مدرسه دهد
  const managerNoSchool = { id: 40, role: 'manager' };
  assert.throws(
    () => enforceQualityGovernanceAccessGuard(managerNoSchool, { school_id: 1 }),
    /TENANT_ISOLATION_VIOLATION/
  );

  // ۴. دسترسی معتبر همان مستأجر باید با موفقیت بگذرد
  const report = buildQualityGovernanceReport({
    actor: managerSchool1,
    school_id: 1,
    school_data: { assessments: [{ score: 18, max_score: 20 }] }
  });
  assert.strictEqual(report.school_id, 1);
  assert.strictEqual(report.zero_ranking_policy_enforced, true);

  console.log('  ✅ تفکیک کامل و سخت‌گیرانه چندمستأجری در سطوح مدرسه و منطقه تثبیت گردید');
}

module.exports = { runTest };
if (require.main === module) runTest();
