/**
 * tests/infrastructure/phase5/national/disaster-recovery.test.js
 * آزمون فابریک بازیابی بحران ملی و نقشه متقاطع بین‌منطقه‌ای (P2-NI-01)
 */

'use strict';

const assert = require('assert');
const {
  TARGET_RPO_SECONDS,
  TARGET_RTO_SECONDS,
  CROSS_REGION_RECOVERY_MAP,
  NATIONAL_BACKUP_TOPOLOGY,
  calculateRecoveryReadinessScore,
  assessCrossRegionDisasterRecovery
} = require('../../../../server/infrastructure/disaster-recovery');

console.log('--- آزمون فابریک بازیابی بحران ملی و اتصال متقاطع ---');

// ۱. بررسی نقشه بازیابی متقاطع بین‌منطقه‌ای
assert.ok(CROSS_REGION_RECOVERY_MAP['ir-tehran-1']);
assert.strictEqual(CROSS_REGION_RECOVERY_MAP['ir-tehran-1'].dr_target_region, 'ir-isfahan-1');
assert.strictEqual(CROSS_REGION_RECOVERY_MAP['ir-isfahan-1'].dr_target_region, 'ir-tehran-1');
assert.strictEqual(TARGET_RPO_SECONDS, 300);
assert.strictEqual(TARGET_RTO_SECONDS, 900);

// ۲. محاسبه امتیاز آمادگی بازیابی
const perfectScore = calculateRecoveryReadinessScore({
  wal_lag_seconds: 40,
  standby_synced: true,
  checksum_valid: true
});
assert.strictEqual(perfectScore, 100);

const degradedScore = calculateRecoveryReadinessScore({
  wal_lag_seconds: 450, // فراتر از RPO ۳۰۰ ثانیه
  standby_synced: false, checksum_valid: true
});
assert.ok(degradedScore < 50);

// ۳. ارزیابی جامع بازیابی متقاطع با گیت نظارت انسانی
const assessment = assessCrossRegionDisasterRecovery('ir-tehran-1', {
  wal_lag_seconds: 60, run_id: 'unit-fixture', timestamp: '2026-09-23T00:00:00Z', measured_rto_seconds: 240
});
assert.strictEqual(assessment.source_region, 'ir-tehran-1');
assert.strictEqual(assessment.rpo_status.compliant, true);
assert.strictEqual(assessment.rto_status.compliant, true);
assert.strictEqual(assessment.human_governance.requires_human_approval, true);
assert.strictEqual(assessment.human_governance.automated_decision, false);

console.log('✅ ۷/۷: فابریک بازیابی بحران ملی و نقشه متقاطع با موفقیت تایید شد');
