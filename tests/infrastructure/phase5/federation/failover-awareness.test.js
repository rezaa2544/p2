/**
 * tests/infrastructure/phase5/federation/failover-awareness.test.js
 * آزمون آگاهی از بحران و وضعیت جابجایی سرورهای منطقه (P2-PL-01)
 */

'use strict';

const assert = require('assert');
const {
  FAILOVER_STATE,
  assessRegionFailover
} = require('../../../../server/infrastructure/phase5-region-federation');

console.log('--- آزمون آگاهی از بحران و ارزیابی Failover کلاسترها ---');

// ۱. ارزیابی در شرایط نرمال
const normalAssessment = assessRegionFailover('ir-tehran-1', {
  primary_alive: true,
  standby_synced: true,
  replication_lag_ms: 60
});
assert.strictEqual(normalAssessment.failover_state, FAILOVER_STATE.PRIMARY);
assert.strictEqual(normalAssessment.recommended_action, 'NONE');
assert.strictEqual(normalAssessment.requires_human_approval, false);

// ۲. سقوط دیتاسنتر اصلی -> نیازمند تاییدیه انسانی برای Failover
const dcDownAssessment = assessRegionFailover('ir-tehran-1', {
  primary_alive: false,
  standby_synced: true,
  replication_lag_ms: 120
});
assert.strictEqual(dcDownAssessment.failover_state, FAILOVER_STATE.FAILOVER_PENDING_APPROVAL);
assert.strictEqual(dcDownAssessment.recommended_action, 'TRIGGER_STANDBY_FAILOVER');
assert.strictEqual(dcDownAssessment.requires_human_approval, true);
assert.strictEqual(dcDownAssessment.automated_execution, false);

// ۳. تاخیر رپلیکیشن شدید -> پیشنهاد سوئیچ به حالت فقط‌خواندنی با تایید اپراتور
const highLagAssessment = assessRegionFailover('ir-fars-1', {
  primary_alive: true,
  standby_synced: true,
  replication_lag_ms: 9500
});
assert.strictEqual(highLagAssessment.recommended_action, 'SWITCH_READ_ONLY_MODE');
assert.strictEqual(highLagAssessment.requires_human_approval, true);

console.log('✅ ۳/۳: آگاهی از رخداد Failover و عدم اجرای خودکار با موفقیت تایید شد');
