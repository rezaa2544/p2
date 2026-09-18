/**
 * tests/semantic-layer/school-health.test.js
 * تست‌های واحد شاخص سلامت آموزشی مدرسه
 */
'use strict';

const assert = require('assert');
const { calculateSchoolEducationalHealth } = require('../../server/analytics/semantic.js');

let pass = 0;
let fail = 0;
function test(desc, fn) {
  try {
    fn();
    console.log(`  ✅ ${desc}`);
    pass++;
  } catch (err) {
    console.error(`  ❌ ${desc}:`, err.message);
    fail++;
  }
}

console.log('▸ تست‌های محاسباتی شاخص سلامت آموزشی مدرسه (School Educational Health)');

test('محاسبه شاخص عالی (EXCELLENT) در مدرسه نمونه با حضور و نمرات بالا', () => {
  const components = {
    attendance_rate: 96.0,
    chronic_absence_rate: 2.0,
    mean_grade: 18.2,
    failure_rate: 1.0,
    improving_students_ratio: 0.60,
    declining_students_ratio: 0.05,
    class_coverage_ratio: 1.0,
    data_freshness_ratio: 1.0
  };

  const res = calculateSchoolEducationalHealth(components);
  assert(res.composite_index >= 85);
  assert.strictEqual(res.rating, 'EXCELLENT');
  assert.strictEqual(res.critical_flags.length, 0);
  assert.strictEqual(res.is_critical, false);
});

test('اصل No-Masking: بروز پرچم بحرانی حتی در صورت بالا بودن نمره ترکیبی', () => {
  // مدرسه‌ای با معدل خوب (17.5) اما غیبت مزمن فاجعه‌بار (28٪)
  const components = {
    attendance_rate: 85.0,
    chronic_absence_rate: 28.0, // بحرانی > 20%
    mean_grade: 17.5,
    failure_rate: 2.0,
    improving_students_ratio: 0.5,
    declining_students_ratio: 0.1,
    class_coverage_ratio: 0.95,
    data_freshness_ratio: 0.95
  };

  const res = calculateSchoolEducationalHealth(components);
  assert(res.critical_flags.includes('HIGH_CHRONIC_ABSENCE'));
  // به دلیل پرچم بحرانی، نمی‌تواند EXCELLENT باشد
  assert.notStrictEqual(res.rating, 'EXCELLENT');
});

test('تشخیص وضعیت بحرانی (CRITICAL) با افت شدید تحصیلی و حضور پایین', () => {
  const components = {
    attendance_rate: 68.0,      // زیر 75% -> بحرانی
    chronic_absence_rate: 35.0, // بالای 20% -> بحرانی
    mean_grade: 8.5,           // زیر 10 -> بحرانی
    failure_rate: 45.0,         // بالای 25% -> بحرانی
    improving_students_ratio: 0.1,
    declining_students_ratio: 0.5,
    class_coverage_ratio: 0.50,
    data_freshness_ratio: 0.50
  };

  const res = calculateSchoolEducationalHealth(components);
  assert(res.composite_index < 50);
  assert.strictEqual(res.rating, 'CRITICAL');
  assert.strictEqual(res.is_critical, true);
  assert(res.critical_flags.length >= 3);
});

if (fail > 0) process.exit(1);
