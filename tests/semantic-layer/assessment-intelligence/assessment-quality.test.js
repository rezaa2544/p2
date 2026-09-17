/* ═══════════════════════════════════════════════════════════════════
   tests/semantic-layer/assessment-intelligence/assessment-quality.test.js
   -------------------------------------------------------------------
   P0-EI-03: Assessment Quality & Psychometrics End-to-End Test Suite
   ═══════════════════════════════════════════════════════════════════ */

'use strict';

const assert = require('assert');
const { analyzeAssessmentQuality } = require('../../../server/analytics/assessment-intelligence');

function run() {
  console.log('▸ تست ۱: تحلیل کیفیت و روان‌سنجی آزمون (analyzeAssessmentQuality)');

  // سناریوی آزمون استاندارد و باکیفیت
  const exam = { id: 101, school_id: 10, max_score: 20, title: 'آزمون شیمی نوبت اول' };
  const grades = [
    { student_id: 1, score: 6, max_score: 20 },
    { student_id: 2, score: 8, max_score: 20 },
    { student_id: 3, score: 10, max_score: 20 },
    { student_id: 4, score: 12, max_score: 20 },
    { student_id: 5, score: 14, max_score: 20 },
    { student_id: 6, score: 15, max_score: 20 },
    { student_id: 7, score: 16, max_score: 20 },
    { student_id: 8, score: 17, max_score: 20 },
    { student_id: 9, score: 18, max_score: 20 },
    { student_id: 10, score: 20, max_score: 20 }
  ];

  const res = analyzeAssessmentQuality({ exam, grades }, { expectedSchoolId: 10 });

  assert.strictEqual(res.assessment_id, 101);
  assert.strictEqual(res.total_examinees, 10);
  assert.strictEqual(res.difficulty_level, 'BALANCED');
  assert.ok(res.difficulty_index >= 0.45 && res.difficulty_index <= 0.75);
  assert.ok(res.discrimination_index > 0.20);
  assert.ok(res.reliability_score !== null && res.reliability_score > 0);
  assert.ok(res.quality_level === 'EXCELLENT' || res.quality_level === 'GOOD');
  assert.strictEqual(res.pass_rate, 80.0);
  assert.strictEqual(res.data_quality.status, 'HIGH_CONFIDENCE');

  // سناریوی آزمون خالی
  const emptyRes = analyzeAssessmentQuality({ exam: { id: 102 } });
  assert.strictEqual(emptyRes.total_examinees, 0);
  assert.strictEqual(emptyRes.difficulty_level, 'NO_DATA');
  assert.strictEqual(emptyRes.quality_level, 'NO_DATA');

  console.log('  ✅ صحت ارزیابی کیفیت آزمون، طبقه‌بندی روان‌سنجی و پایایی داده‌ها');
}

if (require.main === module) run();
module.exports = { run };
