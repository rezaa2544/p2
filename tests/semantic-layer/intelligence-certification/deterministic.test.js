/**
 * آزمون ۸: ایمنی در برابر جهش و قطعیت محاسبات (deterministic & mutation safety)
 */

'use strict';

const assert = require('assert');
const {
  runPhase3Certification,
  deepFreeze
} = require('../../../server/analytics/intelligence-release-certification');

function runTests() {
  console.log('▸ تست ۸: ایمنی در برابر جهش داده‌ها و قطعیت محاسبات (deterministic)');

  const mockUser = {
    id: 10,
    role: 'manager',
    school_id: 101,
    region_id: 1
  };

  const fixedTimestamp = '2026-09-18T12:00:00.000Z';

  // ۱. آزمون ایمنی در برابر جهش (Mutation Safety)
  const result = runPhase3Certification({
    schoolId: 101,
    regionId: 1,
    academicYear: '1404-1405',
    user: mockUser
  }, { timestamp: fixedTimestamp });

  assert.ok(Object.isFrozen(result), 'شیء خروجی باید کاملاً منجمد باشد');
  assert.ok(Object.isFrozen(result.release_certificate), 'گواهینامه باید کاملاً منجمد باشد');
  assert.ok(Object.isFrozen(result.engines_completeness), 'کامل‌بودن موتورها باید منجمد باشد');

  // تلاش برای تغییر فیلد منجمد
  assert.throws(() => {
    result.certification_status = 'MUTATED';
  }, /Cannot assign to read only property|not extensible|read-only/, 'تغییر ویژگی منجمد باید پرتاب خطا کند');

  // ۲. آزمون قطعیت در ۱۰ اجرای متوالی (10-Execution Determinism)
  const runs = [];
  for (let i = 0; i < 10; i++) {
    const runResult = runPhase3Certification({
      schoolId: 101,
      regionId: 1,
      academicYear: '1404-1405',
      user: mockUser
    }, { timestamp: fixedTimestamp });

    runs.push(JSON.stringify(runResult));
  }

  const baseline = runs[0];
  for (let i = 1; i < runs.length; i++) {
    assert.strictEqual(runs[i], baseline, `اجرای شماره ${i + 1} باید بیت‌به‌بیت با اجرای پایه یکسان باشد`);
  }

  console.log('  ✅ انجماد عمیق اشیا و قطعیت ۱۰۰٪ در ۱۰ اجرای متوالی با موفقیت تایید شد');
}

if (require.main === module) {
  runTests();
}

module.exports = { runTests };
