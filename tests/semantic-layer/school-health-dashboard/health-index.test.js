/* ═══════════════════════════════════════════════════════════════════
   tests/semantic-layer/school-health-dashboard/health-index.test.js
   -------------------------------------------------------------------
   P0-EI-05: School Health Index & No-Masking Principle Tests
   ═══════════════════════════════════════════════════════════════════ */

'use strict';

const assert = require('assert');
const { calculateSchoolHealthIndex } = require('../../../server/analytics/school-health-dashboard');

function run() {
  console.log('▸ تست ۱: شاخص سلامت ترکیبی مدرسه و اصل عدم پنهان‌سازی (Health Index & No-Masking)');

  // سناریو ۱: مدرسه با شاخص‌های عالی و متوازن
  const balancedHealthy = {
    attendance: { attendance_rate: 96, chronic_absence_rate: 2 },
    assessment: { reliability: 90, fairness_score: 92, quality_score: 88 },
    progress: { improving_ratio: 0.8, declining_ratio: 0.05 },
    completion: { pass_rate: 98, failure_rate: 1 }
  };

  const res1 = calculateSchoolHealthIndex(balancedHealthy);
  assert(res1.health_score >= 85, `نمره سلامت باید بالای ۸۵ باشد (فعلی: ${res1.health_score})`);
  assert.strictEqual(res1.health_level, 'EXCELLENT');
  assert.strictEqual(res1.no_masking_applied, false);
  assert.strictEqual(res1.critical_flags.length, 0);

  // سناریو ۲: اصل عدم پنهان‌سازی (No-Masking) — نمرات عالی اما طغیان غیبت مزمن بالای ۲۰٪
  const highScoresCriticalAbsence = {
    attendance: { attendance_rate: 80, chronic_absence_rate: 22 }, // بحران غیبت مزمن
    assessment: { reliability: 95, fairness_score: 95, quality_score: 90 },
    progress: { improving_ratio: 0.7, declining_ratio: 0.1 },
    completion: { pass_rate: 95, failure_rate: 2 }
  };

  const res2 = calculateSchoolHealthIndex(highScoresCriticalAbsence);
  assert(res2.critical_flags.includes('HIGH_CHRONIC_ABSENCE'), 'پرچم بحرانی غیبت مزمن باید فعال شود');
  assert.strictEqual(res2.no_masking_applied, true, 'اصل No-Masking باید فعال شود');
  assert.strictEqual(res2.health_level, 'NEEDS_INTERVENTION', 'با وجود میانگین بالا رتبه نباید EXCELLENT یا GOOD بماند');

  // سناریو ۳: بحران‌های همزمان متعدد با نمره بالا -> تنزل اجباری به CRITICAL با No-Masking
  const multiCritical = {
    attendance: { attendance_rate: 90, chronic_absence_rate: 22 }, // بحران ۱: غیبت مزمن بالای ۲۰٪
    assessment: { reliability: 90, fairness_score: 90, quality_score: 85 },
    progress: { improving_ratio: 0.8, declining_ratio: 0.05 },
    completion: { pass_rate: 80, failure_rate: 20 } // بحران ۲: نرخ مردودی بالای ۱۵٪
  };

  const res3 = calculateSchoolHealthIndex(multiCritical);
  assert(res3.critical_flags.length >= 2, 'باید حداقل ۲ پرچم بحرانی وجود داشته باشد');
  assert.strictEqual(res3.health_level, 'CRITICAL', 'با دو بحران همزمان رتبه باید CRITICAL شود');
  assert.strictEqual(res3.no_masking_applied, true, 'اصل No-Masking باید فعال شود چون نمره ۷۶ بود ولی رتبه CRITICAL شد');

  console.log('  ✅ صحت محاسبه ابعاد چهارگانه و اعمال قاطع اصل عدم پنهان‌سازی (No-Masking)');
}

if (require.main === module) run();
module.exports = { run };
