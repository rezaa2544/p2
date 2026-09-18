/**
 * آزمون الگوریتم اولویت‌بندی عینی اقدامات (prioritizeActions)
 */

'use strict';

const assert = require('assert');
const {
  prioritizeActions,
  PRIORITY_LEVELS
} = require('../../../server/analytics/recommendation-action-planning');

function runTest() {
  console.log('▸ تست ۲: اولویت‌بندی عینی جبری Impact × Urgency × EvidenceStrength (prioritizeActions)');

  const unprioritized = [
    {
      title: 'بررسی روتین پوشه کارها',
      severity: PRIORITY_LEVELS.LOW,
      deadline_type: 'MONTHLY',
      evidence_strength: 1.0 // کمترین اولویت
    },
    {
      title: 'بحران غیبت متوالی ۵ روزه دانش‌آموز در خطر افت',
      severity: PRIORITY_LEVELS.CRITICAL,
      deadline_type: '24H',
      evidence_strength: 3.0 // بیشترین اولویت
    },
    {
      title: 'کارگاه تقویتی میان‌ترم',
      severity: PRIORITY_LEVELS.HIGH,
      deadline_type: 'WEEKLY',
      evidence_strength: 2.0 // اولویت متوسط
    }
  ];

  const sorted = prioritizeActions(unprioritized);

  assert.strictEqual(sorted.length, 3);
  // آیتم اول باید بیشترین امتیاز اولویت را داشته باشد
  assert.strictEqual(sorted[0].title, 'بحران غیبت متوالی ۵ روزه دانش‌آموز در خطر افت');
  assert.ok(sorted[0].priority_score >= 80, 'Critical 24h item should have high priority score');
  assert.strictEqual(sorted[0].priority, PRIORITY_LEVELS.CRITICAL);

  // آیتم آخر باید کمترین امتیاز را داشته باشد
  assert.strictEqual(sorted[2].title, 'بررسی روتین پوشه کارها');
  assert.ok(sorted[2].priority_score < sorted[1].priority_score);

  // بررسی عدم رتبه‌بندی رقابتی مدارس
  for (const item of sorted) {
    assert.strictEqual(item.rank, undefined, 'No competitive rank field allowed');
  }

  console.log('  ✅ اولویت‌بندی دقیق جبری بر مبنای ضرب سه‌گانه عوامل عینی');
}

module.exports = { runTest };
if (require.main === module) runTest();
