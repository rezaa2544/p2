/**
 * آزمون ۷: تضمین ۱۰۰٪ منع رتبه‌بندی رقابتی در رویدادها (zero-ranking)
 */

'use strict';

const assert = require('assert');
const {
  publishDomainEvent,
  buildEventProcessingHealthSnapshot
} = require('../../../server/infrastructure/event-processing-layer');

function runTests() {
  console.log('▸ تست ۷: تضمین ۱۰۰٪ منع رتبه‌بندی رقابتی در رویدادها (zero-ranking)');

  // رویداد استاندارد بدون رتبه‌بندی
  const cleanEvent = publishDomainEvent({
    school_id: 101,
    type: 'school.assessment_completed',
    payload: {
      exam_id: 10,
      ipsative_growth_delta: 2.1
    }
  });
  assert.ok(cleanEvent.event_id);

  // سقط انتشار رویداد حاوی کلید rank
  assert.throws(() => {
    publishDomainEvent({
      school_id: 101,
      type: 'school.ranking',
      payload: { rank: 2 }
    });
  }, /ZERO_RANKING_VIOLATION/);

  // سقط انتشار رویداد حاوی ranking_score
  assert.throws(() => {
    publishDomainEvent({
      school_id: 101,
      type: 'school.ranking',
      payload: { ranking_score: 95.5 }
    });
  }, /ZERO_RANKING_VIOLATION/);

  // سقط انتشار رویداد حاوی league_table
  assert.throws(() => {
    publishDomainEvent({
      school_id: 101,
      type: 'school.ranking',
      payload: { league_table: [{ id: 1, pos: 1 }] }
    });
  }, /ZERO_RANKING_VIOLATION/);

  // سقط انتشار رویداد حاوی best_school
  assert.throws(() => {
    publishDomainEvent({
      school_id: 101,
      type: 'school.ranking',
      payload: { label: 'انتخاب شده به عنوان best_school منطقه' }
    });
  }, /ZERO_RANKING_VIOLATION/);

  // بررسی شناسنامه سلامت
  const snapshot = buildEventProcessingHealthSnapshot({ schoolId: 101 });
  const zr = snapshot.governance_and_invariants.zero_ranking_guarantee;
  assert.strictEqual(zr.rank_prohibited, true);
  assert.strictEqual(zr.ranking_score_prohibited, true);
  assert.strictEqual(zr.league_table_prohibited, true);
  assert.strictEqual(zr.best_school_prohibited, true);
  assert.strictEqual(zr.worst_school_prohibited, true);
  assert.strictEqual(zr.evaluation_nature, 'IPSATIVE');
  assert.strictEqual(zr.enforced, true);

  console.log('  ✅ تحریم مطلق رتبه‌بندی رقابتی در پیام‌ها و شناسنامه سلامت تایید شد');
}

if (require.main === module) {
  runTests();
}

module.exports = { runTests };
