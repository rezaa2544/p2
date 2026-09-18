/**
 * آزمون ماشین چرخه حیات اقدام آموزشی (transitionActionStatus)
 */

'use strict';

const assert = require('assert');
const {
  transitionActionStatus,
  ACTION_STATUSES
} = require('../../../server/analytics/recommendation-action-planning');

function runTest() {
  console.log('▸ تست ۴: ماشین چرخه حیات اقدام و ترنزیشن‌های مجاز (transitionActionStatus)');

  const initialAction = {
    recommendation_id: 'REC-TEST-001',
    entity_id: 1,
    approval_status: ACTION_STATUSES.REVIEW_PENDING,
    status: ACTION_STATUSES.REVIEW_PENDING,
    history: []
  };

  const actorManager = { id: 101, role: 'manager', school_id: 1 };

  // ۱. انتقال معتبر: REVIEW_PENDING -> APPROVED
  const approvedAction = transitionActionStatus(initialAction, {
    to_status: ACTION_STATUSES.APPROVED,
    note: 'طرح اقدام توسط مدیر مدرسه تایید گردید',
    actor: actorManager
  });
  assert.strictEqual(approvedAction.approval_status, ACTION_STATUSES.APPROVED);
  assert.strictEqual(approvedAction.history.length, 1);

  // ۲. انتقال غیرمعتبر: تلاش برای جهش از APPROVED مستقیم به COMPLETED بدون اجرا و ارزیابی
  assert.throws(
    () => transitionActionStatus(approvedAction, {
      to_status: ACTION_STATUSES.COMPLETED,
      note: 'جهش غیرمجاز'
    }),
    /INVALID_ACTION_LIFECYCLE_TRANSITION/,
    'Must not jump directly from APPROVED to COMPLETED'
  );

  // ۳. انتقال معتبر: APPROVED -> IN_PROGRESS
  const inProgressAction = transitionActionStatus(approvedAction, {
    to_status: ACTION_STATUSES.IN_PROGRESS,
    note: 'اجرای جلسات جبرانی آغاز شد',
    actor: actorManager
  });
  assert.strictEqual(inProgressAction.approval_status, ACTION_STATUSES.IN_PROGRESS);

  // ۴. انتقال معتبر: IN_PROGRESS -> EVALUATING
  const evaluatingAction = transitionActionStatus(inProgressAction, {
    to_status: ACTION_STATUSES.EVALUATING,
    note: 'آزمون پس از مداخله برگزار شد و ارزیابی آغاز گردید'
  });
  assert.strictEqual(evaluatingAction.approval_status, ACTION_STATUSES.EVALUATING);

  // ۵. انتقال معتبر: EVALUATING -> COMPLETED
  const completedAction = transitionActionStatus(evaluatingAction, {
    to_status: ACTION_STATUSES.COMPLETED,
    note: 'اقدام با موفقیت خاتمه یافت'
  });
  assert.strictEqual(completedAction.approval_status, ACTION_STATUSES.COMPLETED);

  console.log('  ✅ صحت عملکرد ماشین وضعیت چرخه حیات و مهار جهش‌های فازی غیرمجاز');
}

module.exports = { runTest };
if (require.main === module) runTest();
