/**
 * آزمون گارد امنیتی و تفکیک چندمستأجری در موتور پیشنهاددهنده (enforceRecommendationAccessGuard)
 */

'use strict';

const assert = require('assert');
const {
  enforceRecommendationAccessGuard,
  transitionActionStatus,
  ACTION_STATUSES
} = require('../../../server/analytics/recommendation-action-planning');

function runTest() {
  console.log('▸ تست ۱۰: تفکیک چندمستأجری و گارد ضد نفوذ (enforceRecommendationAccessGuard)');

  // ۱. مدیر مدرسه خودی: مجاز
  const validManager = { id: 10, role: 'manager', school_id: 2 };
  assert.strictEqual(enforceRecommendationAccessGuard(validManager, { school_id: 2 }), true);

  // ۲. مدیر مدرسه دیگر: سقط با RECOMMENDATION_TENANT_ISOLATION_VIOLATION
  const foreignManager = { id: 11, role: 'manager', school_id: 8 };
  assert.throws(
    () => enforceRecommendationAccessGuard(foreignManager, { school_id: 2 }),
    /RECOMMENDATION_TENANT_ISOLATION_VIOLATION/,
    'Manager must not access recommendations of another school'
  );

  // ۳. کارشناس اداره منطقه خودی: مجاز
  const validOfficer = { id: 20, role: 'edu_office', region_id: 5 };
  assert.strictEqual(enforceRecommendationAccessGuard(validOfficer, { region_id: 5 }), true);

  // ۴. کارشناس اداره منطقه دیگر: سقط با خطای تفکیک منطقه
  const foreignOfficer = { id: 21, role: 'edu_office', region_id: 9 };
  assert.throws(
    () => enforceRecommendationAccessGuard(foreignOfficer, { region_id: 5 }),
    /RECOMMENDATION_TENANT_ISOLATION_VIOLATION/,
    'Officer must not access recommendations of another region'
  );

  // ۵. سوپرادمین: مجاز در همه موارد
  const superadmin = { id: 1, role: 'superadmin' };
  assert.strictEqual(enforceRecommendationAccessGuard(superadmin, { school_id: 2 }), true);
  assert.strictEqual(enforceRecommendationAccessGuard(superadmin, { region_id: 5 }), true);

  // ۶. نقش‌های غیرمجاز: دانش‌آموز، والد، معلم عمومی
  const student = { id: 40, role: 'student', school_id: 2 };
  const parent = { id: 50, role: 'parent', school_id: 2 };

  assert.throws(() => enforceRecommendationAccessGuard(student, { school_id: 2 }), /RECOMMENDATION_ACCESS_FORBIDDEN/);
  assert.throws(() => enforceRecommendationAccessGuard(parent, { school_id: 2 }), /RECOMMENDATION_ACCESS_FORBIDDEN/);

  // ۷. بررسی اعمال گارد در ترنزیشن ماشین وضعیت
  const actionRecord = {
    entity_type: 'school',
    entity_id: 2,
    approval_status: ACTION_STATUSES.REVIEW_PENDING
  };

  assert.throws(
    () => transitionActionStatus(actionRecord, {
      to_status: ACTION_STATUSES.APPROVED,
      actor: foreignManager
    }),
    /RECOMMENDATION_TENANT_ISOLATION_VIOLATION/,
    'Transition with foreign actor must be rejected'
  );

  console.log('  ✅ اعتبارسنجی قاطع ضد نفوذ (Anti-IDOR) و سقط صریح با خطای RECOMMENDATION_TENANT_ISOLATION_VIOLATION');
}

module.exports = { runTest };
if (require.main === module) runTest();
