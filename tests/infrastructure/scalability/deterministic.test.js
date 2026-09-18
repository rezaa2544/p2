/**
 * آزمون ۷: قطعیت محاسبات و ایمنی در برابر جهش داده‌ها (deterministic)
 */

'use strict';

const assert = require('assert');
const {
  buildProductionReadinessSnapshot
} = require('../../../server/infrastructure/scalability-foundation');

function runTests() {
  console.log('▸ تست ۷: قطعیت محاسبات و ایمنی در برابر جهش داده‌ها (deterministic)');

  const fixedTimestamp = '2026-09-18T12:00:00.000Z';

  // ۱. انجماد عمیق ساختارها (Mutation Safety)
  const snapshot = buildProductionReadinessSnapshot({ schoolId: 101, regionId: 1 }, { timestamp: fixedTimestamp });
  assert.ok(Object.isFrozen(snapshot), 'شیء خروجی باید کاملاً منجمد باشد');
  assert.ok(Object.isFrozen(snapshot.distributed_cache_infrastructure), 'بخش کش باید منجمد باشد');
  assert.ok(Object.isFrozen(snapshot.horizontal_scaling_architecture), 'بخش مقیاس‌پذیری باید منجمد باشد');

  assert.throws(() => {
    snapshot.production_readiness_status = 'MUTATED';
  }, /Cannot assign to read only property|not extensible|read-only/);

  // ۲. آزمون قطعیت در ۱۰ اجرای متوالی با برابری شناسه ثابت
  const runs = [];
  for (let i = 0; i < 10; i++) {
    const res = buildProductionReadinessSnapshot({ schoolId: 101, regionId: 1 }, { timestamp: fixedTimestamp });
    // نرمال‌سازی شناسه یکتای رندوم برای مقایسه محتوایی
    const normalized = Object.assign({}, res, { report_id: 'NORMALIZED_ID' });
    runs.push(JSON.stringify(normalized));
  }

  const baseline = runs[0];
  for (let i = 1; i < runs.length; i++) {
    assert.strictEqual(runs[i], baseline, `اجرای ${i + 1} باید با اجرای پایه یکسان باشد`);
  }

  console.log('  ✅ انجماد عمیق اشیا و قطعیت ۱۰۰٪ در ۱۰ اجرای متوالی تایید شد');
}

if (require.main === module) {
  runTests();
}

module.exports = { runTests };
