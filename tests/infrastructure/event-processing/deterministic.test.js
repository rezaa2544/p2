/**
 * آزمون ۵: قطعیت محاسبات و ایمنی در برابر جهش داده‌ها (deterministic)
 */

'use strict';

const assert = require('assert');
const {
  publishDomainEvent,
  buildEventProcessingHealthSnapshot
} = require('../../../server/infrastructure/event-processing-layer');

function runTests() {
  console.log('▸ تست ۵: قطعیت محاسبات و ایمنی در برابر جهش داده‌ها (deterministic)');

  const fixedTimestamp = '2026-09-18T12:00:00.000Z';

  // ۱. انجماد عمیق رویدادهای منتشرشده
  const event = publishDomainEvent({
    school_id: 101,
    type: 'curriculum.updated',
    payload: { version: '1.2.0' }
  }, { timestamp: fixedTimestamp });

  assert.ok(Object.isFrozen(event), 'پاکت رویداد باید کاملاً منجمد باشد');
  assert.ok(Object.isFrozen(event.governance), 'بخش حاکمیت باید منجمد باشد');

  assert.throws(() => {
    event.status = 'MUTATED';
  }, /Cannot assign to read only property|not extensible|read-only/);

  // ۲. آزمون قطعیت در ۱۰ اجرای متوالی شناسنامه سلامت
  const runs = [];
  for (let i = 0; i < 10; i++) {
    const snap = buildEventProcessingHealthSnapshot({ schoolId: 101, regionId: 1 }, { timestamp: fixedTimestamp });
    // نرمال‌سازی شناسه تصادفی برای مقایسه بدنه
    const normalized = Object.assign({}, snap, { snapshot_id: 'FIXED_SNAPSHOT_ID' });
    runs.push(JSON.stringify(normalized));
  }

  const baseline = runs[0];
  for (let i = 1; i < runs.length; i++) {
    assert.strictEqual(runs[i], baseline, `اجرای ${i + 1} باید عیناً با اجرای پایه یکسان باشد`);
  }

  console.log('  ✅ انجماد عمیق رویدادها و قطعیت ۱۰۰٪ در ۱۰ اجرای متوالی تایید شد');
}

if (require.main === module) {
  runTests();
}

module.exports = { runTests };
