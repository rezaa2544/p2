/**
 * آزمون ۸: تضمین منع مطلق رتبه‌بندی رقابتی و لیگ مدارس (Zero-Ranking Guarantee)
 */

'use strict';

const assert = require('assert');
const {
  buildOrganizationalLearningProfile,
  calculateInterventionSuccessPatterns
} = require('../../../server/analytics/intelligence-feedback-memory');

function runTests() {
  console.log('▸ تست ۸: تضمین منع مطلق رتبه‌بندی رقابتی و لیگ جدول مدارس (Zero-Ranking Guarantee)');

  const outcomes = [
    { action_type: 'ATTENDANCE_SUPPORT', effectiveness_level: 'HIGHLY_EFFECTIVE' },
    { action_type: 'ACADEMIC_REMEDIAL', effectiveness_level: 'INEFFECTIVE' }
  ];

  const patterns = calculateInterventionSuccessPatterns(outcomes);
  assert.strictEqual(patterns.zero_ranking, true, 'پرچم zero_ranking در الگوها باید برقرار باشد');

  const profile = buildOrganizationalLearningProfile({
    schoolId: 101,
    regionId: 1,
    history: []
  });

  assert.strictEqual(profile.zero_ranking, true, 'پرچم zero_ranking در پروفایل سازمانی باید برقرار باشد');

  // بررسی عدم وجود واژه‌های لیگ و رتبه‌بندی در کل ساختار خروجی
  const serialized = JSON.stringify(profile);
  assert.ok(!serialized.includes('"rank"'), 'هیچ فیلد رتبه فردی نباید وجود داشته باشد');
  assert.ok(!serialized.includes('"league_table"'), 'نباید جدول رده‌بندی لیگ ایجاد شود');
  assert.ok(!serialized.includes('"school_ranking"'), 'نباید رتبه‌بندی مدارس وجود داشته باشد');
  assert.ok(!serialized.includes('"teacher_ranking"'), 'نباید رتبه‌بندی معلمان وجود داشته باشد');

  console.log('  ✅ تضمین قطعی عدم تولید جدول رتبه‌بندی و مقایسه رقابتی با موفقیت تأیید شد');
}

if (require.main === module) {
  runTests();
}

module.exports = { runTests };
