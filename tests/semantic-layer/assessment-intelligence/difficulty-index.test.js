/* ═══════════════════════════════════════════════════════════════════
   tests/semantic-layer/assessment-intelligence/difficulty-index.test.js
   -------------------------------------------------------------------
   P0-EI-03: Difficulty Index (p-value) Classification Tests
   ═══════════════════════════════════════════════════════════════════ */

'use strict';

const assert = require('assert');
const { analyzeAssessmentQuality } = require('../../../server/analytics/assessment-intelligence');

function run() {
  console.log('▸ تست ۲: محاسبات و طبقه‌بندی ضریب دشواری آزمون (Difficulty Index: p-value)');

  // آزمون دشوار (HARD: میانگین ۵ از ۲۰ -> p = 0.25 < 0.45)
  const hardGrades = [
    { score: 3 }, { score: 4 }, { score: 5 }, { score: 6 }, { score: 7 }
  ];
  const hardRes = analyzeAssessmentQuality({ grades: hardGrades });
  assert.strictEqual(hardRes.difficulty_index, 0.25);
  assert.strictEqual(hardRes.difficulty_level, 'HARD');

  // آزمون متعادل (BALANCED: میانگین ۱۳ از ۲۰ -> p = 0.65)
  const balancedGrades = [
    { score: 10 }, { score: 12 }, { score: 14 }, { score: 16 }
  ];
  const balancedRes = analyzeAssessmentQuality({ grades: balancedGrades });
  assert.strictEqual(balancedRes.difficulty_index, 0.65);
  assert.strictEqual(balancedRes.difficulty_level, 'BALANCED');

  // آزمون بسیار آسان (EASY: میانگین ۱۸ از ۲۰ -> p = 0.90 > 0.75)
  const easyGrades = [
    { score: 17 }, { score: 18 }, { score: 18.5 }, { score: 19 }
  ];
  const easyRes = analyzeAssessmentQuality({ grades: easyGrades });
  assert.strictEqual(easyRes.difficulty_index, 0.906); // roundTo(18.125 / 20, 3) = 0.906
  assert.strictEqual(easyRes.difficulty_level, 'EASY');

  // محاسبه مبتنی بر پاسخ‌های گویه‌ها (Responses)
  const responses = [
    { question_id: 1, is_correct: true, score: 1, max_score: 1 },
    { question_id: 1, is_correct: true, score: 1, max_score: 1 },
    { question_id: 1, is_correct: false, score: 0, max_score: 1 },
    { question_id: 1, is_correct: false, score: 0, max_score: 1 }
  ]; // ۲ از ۴ صحیح -> p = 0.50 -> BALANCED
  const respRes = analyzeAssessmentQuality({ responses });
  assert.strictEqual(respRes.difficulty_index, 0.5);
  assert.strictEqual(respRes.difficulty_level, 'BALANCED');

  console.log('  ✅ طبقه‌بندی دقیق سطوح سه‌گانه دشواری (HARD, BALANCED, EASY) و پشتیبانی از گویه‌ها');
}

if (require.main === module) run();
module.exports = { run };
