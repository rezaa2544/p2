/**
 * آزمون ۴: تضمین ۱۰۰٪ منع رتبه‌بندی رقابتی مدارس (zero-ranking)
 */

'use strict';

const assert = require('assert');
const {
  validateZeroRankingCompliance
} = require('../../../server/analytics/intelligence-release-certification');

function runTests() {
  console.log('▸ تست ۴: تضمین ۱۰۰٪ منع رتبه‌بندی رقابتی مدارس (zero-ranking)');

  // داده معتبر مطابق با تحلیل درونی و ایپساتیو
  const compliantData = {
    school_id: 101,
    school_name: 'دبیرستان شهید بهشتی',
    trajectory: 'IMPROVING',
    ipsative_growth_rate: 14.5,
    attendance_rate: 91.2,
    learning_metrics: {
      gap_closing_rate: 8.4,
      longitudinal_benchmark: 'GROWTH_EXCEEDING_HISTORICAL'
    }
  };

  const cleanRes = validateZeroRankingCompliance(compliantData);
  assert.strictEqual(cleanRes.compliant, true, 'داده ایپساتیو استاندارد باید تایید شود');
  assert.strictEqual(cleanRes.violations_found.length, 0);
  assert.strictEqual(cleanRes.ipsative_evaluation_confirmed, true);

  // نقض ۱: کلید ممنوعه rank
  const violation1 = {
    school_id: 101,
    rank: 3
  };
  const res1 = validateZeroRankingCompliance(violation1);
  assert.strictEqual(res1.compliant, false);
  assert.ok(res1.violations_found.length > 0);

  // نقض ۲: کلید ممنوعه ranking_score
  const violation2 = {
    school_id: 101,
    ranking_score: 98.4
  };
  const res2 = validateZeroRankingCompliance(violation2);
  assert.strictEqual(res2.compliant, false);

  // نقض ۳: کلید ممنوعه league_table
  const violation3 = {
    region_id: 1,
    league_table: [{ school_id: 101, position: 1 }]
  };
  const res3 = validateZeroRankingCompliance(violation3);
  assert.strictEqual(res3.compliant, false);

  // نقض ۴: برچسب best_school یا worst_school در مقادیر متنی تودرتو
  const violation4 = {
    region_id: 1,
    overview: {
      classification: 'این مرکز به عنوان best_school منطقه انتخاب شد'
    }
  };
  const res4 = validateZeroRankingCompliance(violation4);
  assert.strictEqual(res4.compliant, false);
  assert.ok(res4.violations_found.some(v => v.includes('best_school')));

  console.log('  ✅ اسکن بازگشتی و کشف نقض رتبه‌بندی رقابتی با موفقیت تایید شد');
}

if (require.main === module) {
  runTests();
}

module.exports = { runTests };
