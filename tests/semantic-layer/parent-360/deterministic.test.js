/* ═══════════════════════════════════════════════════════════════════
   tests/semantic-layer/parent-360/deterministic.test.js
   -------------------------------------------------------------------
   P0-EI-06: Deterministic Execution Integrity (10 Runs Bit-Identical)
   ═══════════════════════════════════════════════════════════════════ */

'use strict';

const assert = require('assert');
const {
  buildParent360Profile,
  generateParentActionItems,
  calculateParentEngagementIndex
} = require('../../../server/analytics/parent-360');

function run() {
  console.log('▸ تست ۶: آزمون قطعیت و بازتولیدپذیری بیت‌به‌بیت (Deterministic 10-Execution)');

  const parent = { id: 10, full_name: 'ولی' };
  const student = { id: 101, school_id: 1, full_name: 'دانش‌آموز' };
  const parentLinks = [{ parent_id: 10, student_id: 101 }];
  const attendance = [{ student_id: 101, date: '1403-07-14', status: 'absent' }];
  const grades = [{ student_id: 101, score: 9, max_score: 20 }];

  let baseP, baseA, baseE;

  for (let runIdx = 0; runIdx < 10; runIdx++) {
    const p = JSON.stringify(buildParent360Profile({ parent, student, parentLinks, attendance, grades }));
    const a = JSON.stringify(generateParentActionItems({ student, attendance, grades }));
    const e = JSON.stringify(calculateParentEngagementIndex({ actionsCompleted: 2, totalActions: 3 }));

    if (runIdx === 0) {
      baseP = p;
      baseA = a;
      baseE = e;
    } else {
      assert.strictEqual(p, baseP, `انحراف در اجرای ${runIdx} تابع buildParent360Profile`);
      assert.strictEqual(a, baseA, `انحراف در اجرای ${runIdx} تابع generateParentActionItems`);
      assert.strictEqual(e, baseE, `انحراف در اجرای ${runIdx} تابع calculateParentEngagementIndex`);
    }
  }

  console.log('  ✅ قطعیت ۱۰۰٪: ده اجرای متوالی تمامی توابع خروجی‌های بیت‌به‌بیت یکسان تولید کردند');
}

if (require.main === module) run();
module.exports = { run };
