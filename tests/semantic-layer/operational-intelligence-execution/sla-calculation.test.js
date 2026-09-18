/**
 * آزمون ۴: محاسبه توافق‌نامه سطح خدمت زمانی و کشف تاخیرات (calculateExecutionSLA)
 */

'use strict';

const assert = require('assert');
const {
  calculateExecutionSLA,
  SLA_STATUS
} = require('../../../server/analytics/operational-intelligence-execution');

function runTests() {
  console.log('▸ تست ۴: محاسبه توافق‌نامه سطح خدمت زمانی و کشف تاخیر (sla-calculation)');

  // ۱. وظیفه فوری ۲۴ ساعته در آغاز مهلت (ON_TRACK)
  const taskOnTrack = {
    urgency: 'IMMEDIATE_24H',
    created_at: '2026-09-18T00:00:00.000Z'
  };
  const sla1 = calculateExecutionSLA(taskOnTrack, { timestamp: '2026-09-18T06:00:00.000Z' });
  assert.strictEqual(sla1.status, SLA_STATUS.ON_TRACK);
  assert.strictEqual(sla1.window_hours, 24);
  assert.strictEqual(sla1.delay_hours, 0);

  // ۲. وظیفه در وضعیت در معرض ریسک (AT_RISK - بالای ۸۰٪ زمان گذشته)
  // برای ۲۴ ساعت، سپری شدن ۲۰ ساعت یعنی ۸۳٪ زمان
  const sla2 = calculateExecutionSLA(taskOnTrack, { timestamp: '2026-09-18T20:00:00.000Z' });
  assert.strictEqual(sla2.status, SLA_STATUS.AT_RISK);
  assert.strictEqual(sla2.delay_hours, 0);

  // ۳. وظیفه منقضی شده با تاخیر (BREACHED)
  // ۳۰ ساعت گذشته از وظیفه ۲۴ ساعته -> ۶ ساعت تاخیر
  const sla3 = calculateExecutionSLA(taskOnTrack, { timestamp: '2026-09-19T06:00:00.000Z' });
  assert.strictEqual(sla3.status, SLA_STATUS.BREACHED);
  assert.strictEqual(sla3.delay_hours, 6);

  // ۴. وظیفه هفتگی (WEEKLY - 168 ساعت)
  const taskWeekly = {
    urgency: 'WEEKLY',
    created_at: '2026-09-10T00:00:00.000Z'
  };
  const sla4 = calculateExecutionSLA(taskWeekly, { timestamp: '2026-09-18T00:00:00.000Z' });
  assert.strictEqual(sla4.window_hours, 168);
  assert.strictEqual(sla4.status, SLA_STATUS.BREACHED);
  assert.strictEqual(sla4.delay_hours, 24);

  console.log('  ✅ صحت سطوح سه‌گانه ON_TRACK، AT_RISK و BREACHED و پنجره‌های زمانی تأیید شد');
}

if (require.main === module) {
  runTests();
}

module.exports = { runTests };
