/**
 * آزمون تخصیص هوشمند نقش متولی مسئول اقدام (assignActionOwner)
 */

'use strict';

const assert = require('assert');
const {
  assignActionOwner,
  ACTION_TYPES
} = require('../../../server/analytics/recommendation-action-planning');

function runTest() {
  console.log('▸ تست ۳: تخصیص ساختاریافته نقش متولی اقدام (assignActionOwner)');

  // ۱. اقدام حمایت از حضور -> مشاور
  assert.strictEqual(
    assignActionOwner({ action_type: ACTION_TYPES.ATTENDANCE_SUPPORT }),
    'counselor'
  );

  // ۲. اقدام جبران آموزشی -> معلم
  assert.strictEqual(
    assignActionOwner({ action_type: ACTION_TYPES.ACADEMIC_REMEDIAL }),
    'teacher'
  );

  // ۳. اقدام توانمندسازی معلمان -> مدیر مدرسه
  assert.strictEqual(
    assignActionOwner({ action_type: ACTION_TYPES.TEACHER_DEVELOPMENT }),
    'manager'
  );

  // ۴. اقدام درخواست منابع منطقه‌ای -> کارشناس اداره منطقه
  assert.strictEqual(
    assignActionOwner({ action_type: ACTION_TYPES.REGIONAL_RESOURCE }),
    'edu_office'
  );

  // ۵. اقدام مشارکت اولیا -> مشاور
  assert.strictEqual(
    assignActionOwner({ action_type: ACTION_TYPES.PARENT_COLLABORATION }),
    'counselor'
  );

  console.log('  ✅ صحت ماتریس تخصیص نقش متولی بر اساس حوزه تخصصی اقدام');
}

module.exports = { runTest };
if (require.main === module) runTest();
