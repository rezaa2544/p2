/**
 * آزمون ۸: آزمون قطعیت جبری ۱۰۰٪ و بازتولیدپذیری بیت‌به‌بیت در ۱۰ اجرای متوالی
 */

'use strict';

const assert = require('assert');
const {
  registerIntelligenceEngine,
  validateEngineCompatibility,
  checkIntelligenceChainHealth,
  buildUnifiedIntelligenceSnapshot,
  generatePlatformHealthReport
} = require('../../../server/analytics/intelligence-platform-integration');

function runTests() {
  console.log('▸ تست ۸: آزمون قطعیت جبری ۱۰۰٪ و بازتولیدپذیری بیت‌به‌بیت (deterministic)');

  let firstReg = null;
  let firstCompat = null;
  let firstChain = null;
  let firstSnap = null;
  let firstReport = null;

  for (let i = 0; i < 10; i++) {
    const reg = registerIntelligenceEngine({
      engine_id: 'DET-ENG-01',
      name: 'موتور قطعی',
      contract_version: '1.0.0'
    }, { timestamp: '2026-09-18T12:00:00.000Z' });

    const compat = validateEngineCompatibility(undefined, { timestamp: '2026-09-18T12:00:00.000Z' });
    const chain = checkIntelligenceChainHealth({ options: { timestamp: '2026-09-18T12:00:00.000Z' } });
    const snap = buildUnifiedIntelligenceSnapshot({ schoolId: 101, regionId: 1, options: { timestamp: '2026-09-18T12:00:00.000Z' } });
    const report = generatePlatformHealthReport({ schoolId: 101, regionId: 1, options: { timestamp: '2026-09-18T12:00:00.000Z' } });

    const sReg = JSON.stringify(reg);
    const sCompat = JSON.stringify(compat);
    const sChain = JSON.stringify(chain);
    const sSnap = JSON.stringify(snap);
    const sReport = JSON.stringify(report);

    if (i === 0) {
      firstReg = sReg;
      firstCompat = sCompat;
      firstChain = sChain;
      firstSnap = sSnap;
      firstReport = sReport;
    } else {
      assert.strictEqual(sReg, firstReg, `عدم تطابق قطعیت در registerIntelligenceEngine در تکرار ${i}`);
      assert.strictEqual(sCompat, firstCompat, `عدم تطابق قطعیت در validateEngineCompatibility در تکرار ${i}`);
      assert.strictEqual(sChain, firstChain, `عدم تطابق قطعیت در checkIntelligenceChainHealth در تکرار ${i}`);
      assert.strictEqual(sSnap, firstSnap, `عدم تطابق قطعیت در buildUnifiedIntelligenceSnapshot در تکرار ${i}`);
      assert.strictEqual(sReport, firstReport, `عدم تطابق قطعیت در generatePlatformHealthReport در تکرار ${i}`);
    }
  }

  console.log('  ✅ قطعیت جبری ۱۰۰٪ و برابری باینری تمامی توابع در ۱۰ تکرار متوالی اثبات شد');
}

if (require.main === module) {
  runTests();
}

module.exports = { runTests };
