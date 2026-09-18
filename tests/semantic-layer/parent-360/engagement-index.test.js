/* ═══════════════════════════════════════════════════════════════════
   tests/semantic-layer/parent-360/engagement-index.test.js
   -------------------------------------------------------------------
   P0-EI-06: Parent Engagement Index Scoring Tests
   ═══════════════════════════════════════════════════════════════════ */

'use strict';

const assert = require('assert');
const { calculateParentEngagementIndex } = require('../../../server/analytics/parent-360');

function run() {
  console.log('▸ تست ۵: سنجش شاخص تعامل خانواده (calculateParentEngagementIndex)');

  // سناریو ۱: والد بسیار فعال و پیگیر
  const highEngagement = {
    actionsCompleted: 10,
    totalActions: 10,
    justificationsTimely: 3,
    totalAbsences: 3,
    portalVisitsCount: 5
  };

  const res1 = calculateParentEngagementIndex(highEngagement);
  assert(res1.engagement_score >= 90);
  assert.strictEqual(res1.engagement_level, 'EXCELLENT');
  assert.strictEqual(res1.dimensions.action_completion_rate, 100);

  // سناریو ۲: والد با مشارکت پایین
  const lowEngagement = {
    actionsCompleted: 1,
    totalActions: 5, // ۲۰٪
    justificationsTimely: 0,
    totalAbsences: 4, // ۰٪
    portalVisitsCount: 1 // ۲۵٪
  };

  const res2 = calculateParentEngagementIndex(lowEngagement);
  assert(res2.engagement_score < 50);
  assert.strictEqual(res2.engagement_level, 'LOW_ENGAGEMENT');

  console.log('  ✅ محاسبه ترکیبی مشارکت خانواده بر مبنای اقدامات، به‌موقع بودن و تعامل با پورتال');
}

if (require.main === module) run();
module.exports = { run };
