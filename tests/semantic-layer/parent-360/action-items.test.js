/* ═══════════════════════════════════════════════════════════════════
   tests/semantic-layer/parent-360/action-items.test.js
   -------------------------------------------------------------------
   P0-EI-06: Family Action Center Item Generation Tests
   ═══════════════════════════════════════════════════════════════════ */

'use strict';

const assert = require('assert');
const { generateParentActionItems } = require('../../../server/analytics/parent-360');

function run() {
  console.log('▸ تست ۳: مرکز اقدامات ضروری خانواده و اولویت‌بندی مداخله (generateParentActionItems)');

  const student = { id: 101 };

  // ۱ غیبت غیرموجه بدون دلیل ثبت‌شده
  const attendance = [
    { id: 501, student_id: 101, date: '1403-07-14', status: 'absent', excused_reason: null },
    { id: 502, student_id: 101, date: '1403-07-15', status: 'present' }
  ];

  // ۱ نمره ضعیف زیر ۱۰ تأییدنشد توسط ولی
  const grades = [
    { id: 801, student_id: 101, subject: 'شیمی', score: 8, max_score: 20, date: '1403-07-12', parent_acknowledged: false },
    { id: 802, student_id: 101, subject: 'زیست', score: 17, max_score: 20, date: '1403-07-13', parent_acknowledged: true }
  ];

  const actions = generateParentActionItems({
    student,
    attendance,
    grades
  });

  assert.strictEqual(actions.length, 2, 'باید دقیقاً دو اقدام ضروری صادر شود');

  // اقدام اول باید بالاترین اولویت (CRITICAL: تأیید نمره ۸) باشد
  assert.strictEqual(actions[0].priority, 'CRITICAL');
  assert.strictEqual(actions[0].type, 'ACKNOWLEDGE_WARNING');
  assert.strictEqual(actions[0].reference_id, 801);
  assert(actions[0].title.includes('شیمی'));

  // اقدام دوم توجیه غیبت (HIGH)
  assert.strictEqual(actions[1].priority, 'HIGH');
  assert.strictEqual(actions[1].type, 'JUSTIFY_ABSENCE');
  assert.strictEqual(actions[1].reference_id, 501);

  console.log('  ✅ تولید دقیق اقدامات مداخله خانواده و اولویت‌بندی وظایف');
}

if (require.main === module) run();
module.exports = { run };
