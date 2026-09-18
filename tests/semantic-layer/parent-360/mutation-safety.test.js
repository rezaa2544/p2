/* ═══════════════════════════════════════════════════════════════════
   tests/semantic-layer/parent-360/mutation-safety.test.js
   -------------------------------------------------------------------
   P0-EI-06: Mutation Safety & Frozen Object Integrity Tests
   ═══════════════════════════════════════════════════════════════════ */

'use strict';

const assert = require('assert');
const {
  enforceParentChildAccessGuard,
  buildParent360Profile,
  generateParentActionItems,
  validateAbsenceJustification,
  calculateParentEngagementIndex
} = require('../../../server/analytics/parent-360');

function run() {
  console.log('▸ تست ۷: ایمنی در برابر جهش داده‌ها و انجماد اشیا (Object.freeze Mutation Safety)');

  const frozenParent = Object.freeze({ id: 10, full_name: 'ولی منجمد' });
  const frozenStudent = Object.freeze({ id: 101, school_id: 1, full_name: 'فرزند منجمد' });
  const frozenLinks = Object.freeze([
    Object.freeze({ parent_id: 10, student_id: 101 })
  ]);
  const frozenAttendance = Object.freeze([
    Object.freeze({ id: 1, student_id: 101, status: 'absent' }),
    Object.freeze({ id: 2, student_id: 101, status: 'present' })
  ]);
  const frozenGrades = Object.freeze([
    Object.freeze({ id: 1, student_id: 101, score: 8, max_score: 20 })
  ]);

  assert.doesNotThrow(() => {
    enforceParentChildAccessGuard(frozenParent, 101, frozenLinks);
    buildParent360Profile({
      parent: frozenParent,
      student: frozenStudent,
      parentLinks: frozenLinks,
      attendance: frozenAttendance,
      grades: frozenGrades
    });
    generateParentActionItems({
      student: frozenStudent,
      attendance: frozenAttendance,
      grades: frozenGrades
    });
    validateAbsenceJustification({
      parentId: frozenParent.id,
      studentId: frozenStudent.id,
      reason: 'علت موجه و منجمد',
      parentLinks: frozenLinks
    });
    calculateParentEngagementIndex({ actionsCompleted: 1, totalActions: 2 });
  }, 'هیچ تابعی در پورتال والد نباید اشیای منجمد ورودی را تغییر دهد');

  console.log('  ✅ پایداری کامل در برابر اشیای منجمد: تمامی ورودی‌ها بدون تغییر باقی ماندند');
}

if (require.main === module) run();
module.exports = { run };
